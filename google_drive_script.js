/**
 * Lens Dataset Collector — Google Apps Script backend (API v2)
 *
 * Drive strukturu:
 *   <ROOT_FOLDER_ID>/<Ad>/<sinif>/<sinif>_<Ad>_<tarix>.jpg
 *   məs. Leyla/mouse/mouse_Leyla_20261018-164803-123_k3f9.jpg
 *
 * Endpoint-lər:
 *   GET  ?action=tree  → istifadəçi qovluqları və onların sinif alt qovluqları
 *   GET  ?action=ping  → { status: "ok", version: 2 }
 *   POST (text/plain JSON) { userName, className, fileName, image, meta } → şəkli saxlayır
 *
 * Yeniləmə: Deploy → Manage deployments → ✏️ Edit → Version: "New version" → Deploy
 *   Execute as: Me · Who has access: Anyone  (URL dəyişmir)
 */

var ROOT_FOLDER_ID = "1PIz4lSXEC4cz7PRve9MRHmyTAh8n4wVR";
var API_VERSION = 2;
var MAX_IMAGE_BYTES = 10 * 1024 * 1024;
var MAX_NEW_FOLDERS_PER_HOUR = 200;
var FILE_CLAIM_TTL = 6 * 60 * 60; // saniyə
var PENDING_CLAIM_TTL = 120; // saniyə — çökmüş sorğunun işarəsi uzun qalmasın
var MAX_NAME_LENGTH = 60;
var MAX_FILE_NAME_LENGTH = 150;
var FOLDER_CACHE_TTL = 6 * 60 * 60; // saniyə
var TREE_CACHE_KEY = "tree:v2";
var TREE_CACHE_TTL = 60; // saniyə
var META_KEYS = ["capturedAt", "scenario", "mode", "mirror", "width", "height", "camera", "luminance", "app"];

function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    if (params.action === "ping") {
      return json_({ status: "ok", version: API_VERSION });
    }
    return json_(getTree_(params.fresh === "1"));
  } catch (err) {
    return json_({ status: "error", message: errorMessage_(err) });
  }
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("Sorğu boşdur");
    }
    var data = JSON.parse(e.postData.contents);

    var userName = cleanName_(data.userName);
    if (!userName) throw new Error("Ad (userName) boşdur");
    // v1 klientləri className göndərmir — onda şəkil birbaşa istifadəçi qovluğuna düşür.
    var className = cleanClass_(data.className);
    var bytes = decodeJpeg_(data.image);
    var fileName = cleanFileName_(data.fileName) || defaultFileName_(userName, className);

    // Klient vaxt aşımından sonra eyni faylı təkrar göndərə bilər, halbuki ilk sorğu hələ işləyir.
    // "pending" işarəsi ikinci sorğunu birincinin nəticəsini gözləməyə məcbur edir — dublikat yaranmır.
    var cache = CacheService.getScriptCache();
    var claimKey = fileClaimKey_(userName, className, fileName);
    var file = fileFromClaim_(cache, claimKey);
    var claimed = false;
    if (!file) {
      cache.put(claimKey, "pending", PENDING_CLAIM_TTL);
      claimed = true;
    }

    try {
      var root = DriveApp.getFolderById(ROOT_FOLDER_ID);
      var userFolder = findOrCreateFolder_(root, userName, nameKey_);
      var target = className ? findOrCreateFolder_(userFolder, className, cleanClass_) : userFolder;
      var savedClass = className ? target.getName() : "";

      if (!file) file = findFileByName_(target, fileName);
      if (!file) {
        file = target.createFile(Utilities.newBlob(bytes, "image/jpeg", fileName));
        try {
          file.setDescription(JSON.stringify(buildMeta_(data.meta, userFolder.getName(), savedClass)));
        } catch (ignored) {
          // Metadata əlavədir; yazıla bilməsə şəkil yenə saxlanılır.
        }
      }
      if (claimed) cache.put(claimKey, file.getId(), FILE_CLAIM_TTL);
    } catch (saveErr) {
      if (claimed) cache.remove(claimKey);
      throw saveErr;
    }

    return json_({
      status: "success",
      version: API_VERSION,
      fileId: file.getId(),
      fileName: fileName,
      folderId: target.getId(),
      folderName: target.getName(),
      userFolderId: userFolder.getId(),
      userName: userFolder.getName(),
      className: savedClass,
      path: savedClass ? userFolder.getName() + "/" + savedClass : userFolder.getName()
    });
  } catch (err) {
    return json_({ status: "error", message: errorMessage_(err) });
  }
}

/* ---------- Qovluq ağacı ---------- */

function getTree_(fresh) {
  var cache = CacheService.getScriptCache();
  if (!fresh) {
    var cached = cache.get(TREE_CACHE_KEY);
    if (cached) return JSON.parse(cached);
  }

  var root = DriveApp.getFolderById(ROOT_FOLDER_ID);
  var classSet = {};
  var users = listChildFolders_(root).map(function (user) {
    var classes = listChildFolders_(user.folder).map(function (c) {
      classSet[cleanClass_(c.name)] = c.name;
      return { id: c.id, name: c.name };
    });
    return { id: user.id, name: user.name, classes: classes };
  });

  var classes = Object.keys(classSet).map(function (k) { return classSet[k]; }).sort(compareNames_);
  var tree = {
    status: "ok",
    version: API_VERSION,
    users: users,
    classes: classes,
    // v1 klientləri üçün uyğunluq
    folders: users.map(function (u) { return { id: u.id, name: u.name }; })
  };

  try {
    cache.put(TREE_CACHE_KEY, JSON.stringify(tree), TREE_CACHE_TTL);
  } catch (ignored) {
    // Keş limiti (100 KB) aşılarsa sadəcə keşləmirik.
  }
  return tree;
}

function listChildFolders_(parent) {
  var out = [];
  var it = parent.searchFolders("trashed = false");
  while (it.hasNext()) {
    var f = it.next();
    out.push({ id: f.getId(), name: f.getName(), folder: f });
  }
  out.sort(function (a, b) { return compareNames_(a.name, b.name); });
  return out;
}

/* ---------- Qovluq tap / yarat (dublikatsız) ---------- */

/**
 * Finds the child folder whose normalised name (keyFn) equals keyFn(name), or creates it.
 * keyFn: nameKey_ for person folders, cleanClass_ for class folders — so "leyla",
 * "LEYLA" and a hand-made "Leyla " all resolve to the same folder.
 */
function findOrCreateFolder_(parent, name, keyFn) {
  var cache = CacheService.getScriptCache();
  var wanted = keyFn(name);
  var key = folderCacheKey_(parent.getId(), wanted);

  var folder = folderFromCache_(cache, key, parent.getId(), wanted, keyFn) || findChildFolder_(parent, wanted, keyFn);
  if (folder) {
    cache.put(key, folder.getId(), FOLDER_CACHE_TTL);
    return folder;
  }

  // Eyni anda gələn iki sorğu eyni yeni qovluğu iki dəfə yaratmasın.
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    // Əvvəlki kilid sahibi yeni qovluğun ID-sini keşə yazıb — Drive axtarışı onu hələ göstərməyə bilər.
    folder = folderFromCache_(cache, key, parent.getId(), wanted, keyFn) || findChildFolder_(parent, wanted, keyFn);
    if (!folder) {
      countFolderCreation_(cache);
      folder = parent.createFolder(name);
      cache.remove(TREE_CACHE_KEY);
    }
    cache.put(key, folder.getId(), FOLDER_CACHE_TTL);
    return folder;
  } finally {
    lock.releaseLock();
  }
}

// Endpoint açıqdır — sui-istifadə zamanı Drive-ı yüzlərlə zibil qovluqla doldurmasın deyə saatlıq limit.
function countFolderCreation_(cache) {
  var key = "created:" + Utilities.formatDate(new Date(), "UTC", "yyyyMMddHH");
  var count = Number(cache.get(key) || 0);
  if (count >= MAX_NEW_FOLDERS_PER_HOUR) {
    throw new Error("Yeni qovluq limiti bu saat üçün dolub. Bir az sonra yenidən cəhd edin.");
  }
  cache.put(key, String(count + 1), 2 * 60 * 60);
}

function findChildFolder_(parent, wanted, keyFn) {
  var match = null;
  var it = parent.searchFolders("trashed = false");
  while (it.hasNext()) {
    var f = it.next();
    if (keyFn(f.getName()) !== wanted) continue;
    // Köhnə dublikatlar varsa, həmişə ən köhnəsini seç ki, nəticə sabit olsun.
    if (!match || f.getDateCreated() < match.getDateCreated()) match = f;
  }
  return match;
}

function folderFromCache_(cache, key, parentId, wanted, keyFn) {
  var id = cache.get(key);
  if (!id) return null;
  try {
    var f = DriveApp.getFolderById(id);
    if (!f.isTrashed() && keyFn(f.getName()) === wanted && hasParent_(f, parentId)) {
      return f;
    }
  } catch (ignored) {
    // Qovluq silinib və ya əlçatan deyil — aşağıda yenidən axtarılır.
  }
  cache.remove(key);
  return null;
}

/* ---------- Fayl dublikatlarının qarşısı ---------- */

function fileClaimKey_(userName, className, fileName) {
  return "file:" + digestKey_(nameKey_(userName) + "/" + className + "/" + fileName);
}

// Eyni fayl artıq yaradılıbsa onu qaytarır; başqa sorğu hələ yaradırsa onun bitməsini gözləyir.
function fileFromClaim_(cache, claimKey) {
  var value = cache.get(claimKey);
  for (var i = 0; value === "pending" && i < 45; i++) {
    Utilities.sleep(1000);
    value = cache.get(claimKey);
  }
  if (!value || value === "pending") return null;
  try {
    var f = DriveApp.getFileById(value);
    if (!f.isTrashed()) return f;
  } catch (ignored) {
    // Fayl silinib — yenidən yaradılacaq.
  }
  return null;
}

function findFileByName_(folder, fileName) {
  var it = folder.getFilesByName(fileName);
  while (it.hasNext()) {
    var f = it.next();
    if (!f.isTrashed()) return f;
  }
  return null;
}

function hasParent_(folder, parentId) {
  var parents = folder.getParents();
  while (parents.hasNext()) {
    if (parents.next().getId() === parentId) return true;
  }
  return false;
}

function folderCacheKey_(parentId, wanted) {
  return "folder:" + digestKey_(parentId + "/" + wanted);
}

function digestKey_(text) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text, Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(digest);
}

/* ---------- Validasiya (js/utils.js ilə eyni qaydalar) ---------- */

// "İ".toLowerCase() → "i̇" (U+0307 əlavə edir), ona görə əvvəlcə "İ" → "i".
function fold_(value) {
  return String(value == null ? "" : value).normalize("NFC").replace(/İ/g, "i").toLowerCase();
}

function cleanName_(value) {
  return String(value == null ? "" : value)
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f\/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME_LENGTH)
    .trim();
}

function nameKey_(value) {
  return fold_(cleanName_(value));
}

function cleanClass_(value) {
  return fold_(cleanName_(value)).replace(/ /g, "_");
}

function cleanFileName_(value) {
  var name = String(value == null ? "" : value)
    .replace(/[\u0000-\u001f\u007f\/\\:*?"<>|]/g, "_")
    .trim()
    .slice(0, MAX_FILE_NAME_LENGTH);
  if (!name) return "";
  if (!/\.jpe?g$/i.test(name)) name += ".jpg";
  return name;
}

function defaultFileName_(userName, className) {
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd-HHmmss-SSS");
  var parts = [className, userName, stamp].filter(function (p) { return p; });
  return cleanFileName_(parts.join("_").replace(/\s+/g, "_"));
}

function decodeJpeg_(image) {
  if (typeof image !== "string" || !image) throw new Error("Şəkil (image) göndərilməyib");
  var comma = image.indexOf(",");
  var bytes = Utilities.base64Decode(comma > -1 ? image.slice(comma + 1) : image);
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error("Şəkil çox böyükdür (maks. 10 MB)");
  // JPEG imzası: FF D8 FF (Apps Script baytları işarəli saxlayır)
  if (bytes.length < 4 || (bytes[0] & 0xff) !== 0xff || (bytes[1] & 0xff) !== 0xd8 || (bytes[2] & 0xff) !== 0xff) {
    throw new Error("Yalnız JPEG şəkillər qəbul olunur");
  }
  return bytes;
}

function buildMeta_(meta, userName, className) {
  var out = { user: userName, class: className, uploadedAt: new Date().toISOString() };
  if (meta && typeof meta === "object") {
    META_KEYS.forEach(function (k) {
      var v = meta[k];
      if (v === undefined || v === null) return;
      out[k] = typeof v === "number" || typeof v === "boolean" ? v : String(v).slice(0, 120);
    });
  }
  return out;
}

/* ---------- Köməkçilər ---------- */

function compareNames_(a, b) {
  return a.localeCompare(b, "az", { sensitivity: "base" });
}

function errorMessage_(err) {
  return String((err && err.message) || err);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
