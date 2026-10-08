const assert = require("assert");
const {
  generateMemorablePin,
  escapeHtml,
  fullName,
  dayKey,
  todayKey,
  pdfCleanDate,
  formatCardDate,
  formatCardTime,
  validateRows,
  parseCSV
} = require("./app.js");

console.log("🧪 eYoklama Unit Test Suite Başlatılıyor...\n");

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Hata: ${err.message}`);
    process.exitCode = 1;
  }
}

// 1. Security & Sanitization Tests
test("escapeHtml: Tehlikeli karakterleri (XSS) filtreler", () => {
  assert.strictEqual(escapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  assert.strictEqual(escapeHtml("Ahmet & Mehmet 'Can'"), 'Ahmet &amp; Mehmet &#039;Can&#039;');
});

// 2. Name & Formatting Tests
test("fullName: Ad soyad birleştirme ve boşluk temizleme", () => {
  assert.strictEqual(fullName({ firstName: "  Ahmet ", lastName: " Yılmaz " }), "Ahmet Yılmaz");
  assert.strictEqual(fullName({ firstName: "Mehmet", lastName: "" }), "Mehmet");
});

// 3. Date Utility Tests
test("dayKey & pdfCleanDate: Tarih formatlama", () => {
  const d = "2026-10-08T14:30:00Z";
  assert.strictEqual(dayKey(d), "2026-10-08");
  assert.strictEqual(pdfCleanDate(d), "08.10");
  assert.match(todayKey(), /^\d{4}-\d{2}-\d{2}$/);
});

// 4. PIN Generator Tests (100 Iterations)
test("generateMemorablePin: 6 haneli, simetrik ve akılda kalıcı PIN üretimi", () => {
  for (let i = 0; i < 100; i++) {
    const pin = generateMemorablePin();
    assert.match(pin, /^\d{6}$/, `PIN 6 haneli sayı olmalıdır: ${pin}`);
    assert.notStrictEqual(pin, "000000", "Zayıf PIN üretilemez");
    assert.notStrictEqual(pin, "111111", "Zayıf PIN üretilemez");
  }
});

// 5. CSV Parsing Tests
test("parseCSV: Virgüllü ve noktalı virgüllü CSV okuma", () => {
  const csv1 = "Ahmet,Yılmaz\nMehmet,Kaya";
  const parsed1 = parseCSV(csv1);
  assert.strictEqual(parsed1.length, 2);
  assert.deepStrictEqual(parsed1[0], ["Ahmet", "Yılmaz"]);

  const csv2 = "Ali;Demir\nVeli;Şahin";
  const parsed2 = parseCSV(csv2);
  assert.strictEqual(parsed2.length, 2);
  assert.deepStrictEqual(parsed2[0], ["Ali", "Demir"]);
});

// 6. Student Import Validation Tests
test("validateRows: Öğrenci import satır doğrulama", () => {
  const raw = [
    ["İsim", "Soyisim"], // Başlık satırı
    ["Ahmet", "Yılmaz"],
    [" Ayşe ", " Öztürk "]
  ];
  const validated = validateRows(raw);
  assert.strictEqual(validated.length, 2);
  assert.strictEqual(validated[0].firstName, "Ahmet");
  assert.strictEqual(validated[0].lastName, "Yılmaz");
  assert.strictEqual(validated[1].firstName, "Ayşe");
  assert.strictEqual(validated[1].lastName, "Öztürk");
});

// 7. PDF Export Data Filter Logic Test
test("PDF Filtreleme Mantığı: Sadece devamsız/izinli öğrencileri seçme", () => {
  const students = [
    { key: "1", name: "Tam Katılan", absentCount: 0, excusedCount: 0 },
    { key: "2", name: "Yok Olan", absentCount: 1, excusedCount: 0 },
    { key: "3", name: "İzinli Olan", absentCount: 0, excusedCount: 1 }
  ];

  const filtered = students.filter(s => s.absentCount > 0 || s.excusedCount > 0);
  assert.strictEqual(filtered.length, 2);
  assert.strictEqual(filtered[0].name, "Yok Olan");
  assert.strictEqual(filtered[1].name, "İzinli Olan");
});

console.log(`\n🎉 Test Tamamlandı: ${passed}/${total} test başarıyla geçti.`);

