# SUPABASE & AUTHENTICATION SPECIFICATION (eYoklama v3)

> **Status:** Active & Enforced Single Source of Truth  
> Bu belge eYoklama'nın canlı Supabase veritabanı şemasını, çoklu kurum (multi-tenancy) altyapısını, okul ana öğrenci havuzunu (`school_students`) ve TC No tabanlı hoca onay/giriş mekanizmasını kesin olarak belgeler.

---

## 1. Canlı Supabase Tablo Yapısı (Gerçek İsimler)

| Tablo Adı | SQL Kurulum Dosyası | Açıklama | Multi-Tenant Kolon |
|---|---|---|---|
| `public.institutions` | `migrate-to-multi-tenant.sql` | Kurumlar (`id`, `slug`/kurum_kodu, `name`, `admin_password_hash`) | `id` (PK) |
| `public.lists` | `setup-complete-schema.sql` | Sınıf paketleri (`id`, `name`, `created_at`) | `institution_id` (FK) |
| `public.students` | `setup-complete-schema.sql` | Sınıflardaki öğrenciler (`id`, `list_id`, `first_name`, `last_name`, `tc_no`) | `institution_id` (FK) |
| `public.attendance_sessions` | `setup-complete-schema.sql` | Alınan yoklama üst kayıtları (`id`, `list_id`, `taken_by_name`, `taken_at`, `archived_at`) | `institution_id` (FK) |
| `public.attendance_entries` | `setup-complete-schema.sql` | Yoklamadaki öğrenci durumları (`attendance_id`, `student_id`, `status`) | N/A (`attendance_id` üzerinden bağlı) |
| `public.school_students` | `setup-school-pool-schema.sql` | Okul genel öğrenci havuzu (`id`, `first_name`, `last_name`, `tc_no`, `class_label`) | `institution_id` (FK) |
| `public.student_grades` | `setup-grades-schema.sql` | Notlar ve kanaatler tablosu (`student_tc`, `list_id`, `course_name`, `term`, `exam`, `grade`, `opinion`) | `institution_id` (FK) |
| `public.teacher_registrations` | `setup-teacher-approvals-schema.sql` | Hoca kayıt/cihaz onay tablosu (`tc_no`, `full_name`, `status`, `device_token`, `approved_at`) | `institution_id` (FK) |
| `public.app_sessions` | `setup-complete-schema.sql` | Aktif oturum tokenları (`token`, `role`, `display_name`, `device_token`, `expires_at`) | `institution_id` (FK) |

---

## 2. Kimlik Doğrulama (Auth) & Hoca Onay Akışı (`src/features/auth/`)

### A. Giriş Ekranı (3 Sekmeli Yapı: `auth-view.ts` & `teacher-auth.ts`)
1. **Hoca Girişi (Şifresiz, TC ve Kurum Kodu ile):**
   - **Gerekli Alanlar:** `Kurum Kodu` (örn: `bilfen`, `default`), `Ad Soyad` (ilk kayıtta), `T.C. Kimlik No` (11 hane, `tc-validator.ts` ile doğrulanır).
   - **İlk Giriş / Onaysız Cihaz:**
     - Hoca formunu doldurup "Giriş Yap / Onaya Gönder"e basar (`request_teacher_access` RPC).
     - `teacher_registrations` tablosuna `status = 'pending'` olarak düşer.
     - Hoca ekranında: *"Yöneticinizden onay bekleniyor..."* bildirimi ve yükleniyor animasyonu çıkar.
     - **Otomatik İçeri Alma (Polling):** Arka planda 3.5 saniyede bir `check_teacher_approval` RPC sorgulanır. Yönetici onayladığı an hoca hiçbir şeye basmadan otomatik olarak ana sayfaya yönlendirilir.
   - **Sonraki Girişler (Onaylanmış Hoca):**
     - Cihaz çerezleri silinse veya başka cihazdan girilse bile: Hoca sadece `Kurum Kodu` + `T.C. Kimlik No` girer.
     - Sistem T.C.'yi daha önceden onaylanmış bulduğu için direkt oturum açar.

2. **Veli / Not Sorgu (`parent-report-view.ts`):**
   - **Gerekli Alanlar:** `Kurum Kodu` + `Öğrenci T.C. Kimlik No`.
   - Doğrudan şifresiz karne ve devamsızlık özetini gösterir (`get_student_report` RPC).

3. **Kurum Girişi (Yönetici):**
   - **Gerekli Alanlar:** `Kurum Kodu` + `Yönetici Şifresi`.
   - Tam yetkili admin oturumu açar (`login_with_password` RPC).

---

## 3. Yönetici Paneli & Okul Havuzu (`src/features/settings/` & `src/features/lists/`)

- **Hoca Onay Yönetimi (`teacher-management.ts`):**
  - **Onay Bekleyen Hocalar:** Ad Soyad, T.C. No, Talep Saati/Tarihi. Aksiyonlar: `[Onayla]` ve `[Reddet]`.
  - **Onaylı Hocalar / Cihazlar:** Kurumda aktif olan hocaların listesi ve `[Yetkiyi Kaldır]` (`revoke`) aksiyonu.
- **Okul Ana Öğrenci Havuzu (`pool-management.ts` & `pool-selector.ts`):**
  - Yönetici CSV ile tüm okul öğrencilerini `school_students` havuzuna toplu yükleyebilir (`import_school_students`).
  - Hocalar veya yöneticiler sınıf listesi oluştururken havuzdan filtreleyerek sınıfa öğrenci seçip aktarabilir (`assign_pool_students_to_list`).

---

## 4. Temel Supabase RPC Fonksiyonları (`src/data/supabase/rpc.ts`)

### Kimlik Doğrulama & Hoca Onay
1. `request_teacher_access(p_institution_slug, p_tc_no, p_full_name, p_device_token)` $\rightarrow$ `{ status: 'approved' | 'pending' | 'rejected', token?, ... }`
2. `check_teacher_approval(p_institution_slug, p_tc_no, p_device_token)` $\rightarrow$ `{ approved: boolean, status?, token?, ... }`
3. `admin_get_teacher_approvals(p_token)` $\rightarrow$ `{ pending: TeacherApprovalItem[], approved: TeacherApprovalItem[] }`
4. `admin_decide_teacher(p_token, p_registration_id, p_action)` $\rightarrow$ `p_action IN ('approve', 'reject', 'revoke')`

### Okul Öğrenci Havuzu (Master Pool)
5. `get_school_students(p_token)` $\rightarrow$ `MasterStudent[]`
6. `import_school_students(p_token, p_students)` $\rightarrow$ `{ importedCount: number }`
7. `delete_school_student(p_token, p_student_id)` $\rightarrow$ `{ success: boolean }`
8. `assign_pool_students_to_list(p_token, p_list_id, p_student_ids)` $\rightarrow$ `{ assignedCount: number }`
