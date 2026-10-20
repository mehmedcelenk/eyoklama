# eYoklama (v3.0.0 — MVP)

Hızlı, sade ve güvenilir dijital yoklama yönetim sistemi.

## 🎯 MVP Kapsamı (Mevcut Durum)
- **Hoca Girişi:** Hoca adı ve PIN kodu ile anında giriş (7 gün geçerli tek tıkla hatırlanan oturum).
- **Kurum / Yönetici Girişi:** Yönetici şifresi ile doğrudan giriş.
- **Sınıf & Öğrenci Yönetimi:** Sınıf listeleri, sınıf içi öğrenci düzenleme çekmecesi, okul öğrenci havuzu.
- **3-Durumlu Yoklama:** Var / Yok / İzinli (3-state cycle), 45 saniyelik eşzamanlı çakışma önleyici kilit (heartbeat lock).
- **Günün İzinlileri:** Önceden izinli girilen öğrenciler için kilitli rozet ve otomatik izinli yoklama kaydı.
- **Geçmiş Yoklamalar:** Gün, hafta ve ay bazlı gruplama; Excel (.csv), Word (.docx) ve Lazy-load PDF indirme.
- **Mimari:** Native DOM (sıfır React/Vue/Svelte), katı 4-katmanlı mimari, 350 satır sınırına uyumlu modüler yapı.

## 🛣️ Sürüm Yol Haritası
- **MVP (Mevcut):** Temel, kaya gibi sağlam yoklama akışı.
- **v1.0.0 (Sıradaki):** Fiziksel ve hibrit yoklama şablonları (dijital yoklamayı kağıda aktarma / aylık matbu çıktılar).
- **v2.0.0 (Sonraki):** Veli Not ve Yoklama Sorgu Portalı.
- **v2.2.0 (Sonraki):** Not, Kanaat ve Karne değerlendirme modülü.
- **v3.0.0 (Gelecek):** Bağımsız ve freelance öğretmenler için çoklu kurum araçları.

## 🛠️ Geliştirme ve Test
```bash
# Mimari kurallarını ve birim testlerini çalıştır
npm run check

# Tip kontrolü
npm run check:types

# Üretim derlemesi
npm run build
```

