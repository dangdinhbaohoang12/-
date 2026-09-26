# 🛢️ OFFSHORE PTW

**Hệ thống quản lý Giấy phép Làm việc (Permit To Work - PTW) cho môi trường giàn khoan dầu khí.**

Repository này chứa một ứng dụng web React/TypeScript cùng API serverless trên Vercel và cơ sở dữ liệu PostgreSQL/Supabase. Mục tiêu của phiên bản hiện tại là số hóa vòng đời PTW, RBAC, approval chain, Gas Test, SIMOPS, revision, audit trail và notification, đồng thời đưa authentication và các kiểm tra authorization quan trọng ra khỏi trình duyệt.

> ⚠️ **Lưu ý an toàn:** Đây là phần mềm mô phỏng/nghiệm thu nghiệp vụ và **không tự động trở thành hệ thống PTW production hoặc nguồn dữ liệu an toàn duy nhất** chỉ vì đã có backend. Trước khi sử dụng thực tế phải triển khai, kiểm định, cấu hình và phê duyệt theo quy trình HSE/IT của đơn vị vận hành. Các ngưỡng Gas Test và workflow trong mã nguồn là cấu hình của repository, không phải tuyên bố rằng chúng phù hợp cho mọi giàn hoặc quy chuẩn.

## 🌐 Demo và repository

**Ứng dụng triển khai hiện tại:**

https://offshore-ptw.vercel.app/#/login

**Repository:**

https://github.com/dangdinhbaohoang12/quan-ly-gian

---

## ✨ Chức năng chính

### 📊 Dashboard

Dashboard theo dõi các PTW đang hoạt động và các cảnh báo nghiệp vụ, bao gồm:

- Permit đang hoạt động, đang chờ duyệt và sắp hết hạn.
- Permit có Gas Test không đạt.
- Xung đột SIMOPS.
- Danh sách permit và hoạt động gần đây.
- Audit Trail.
- QR code để đối chiếu tại hiện trường.
- Tìm kiếm theo số permit, khu vực, thiết bị hoặc nội dung công việc.

### 📝 Tạo và quản lý PTW

Màn hình PTW hỗ trợ:

- Sinh số permit tự động theo dữ liệu catalog.
- Chọn platform, area, equipment và loại permit.
- Khai báo risk level, priority, mô tả công việc và lý do phát hành.
- Khai báo planned start/end.
- Checklist an toàn theo từng permit type.
- Kiểm tra SIMOPS khi lập permit.
- Lưu và chỉnh sửa draft trong các trạng thái được phép.

### 🔄 Workflow và Approval Chain

Trạng thái được kiểm soát bởi workflow/state machine và approval rule engine:

```text
DRAFT
  ↓
SUBMITTED
  ↓
LINE SUPERVISOR REVIEW
  ↓
FPS REVIEW
  ↓
DEPUTY OIM REVIEW
  ↓
OIM REVIEW
  ↓
APPROVED
  ↓
WORK IN PROGRESS
  ├──→ SUSPENDED → RESUMED
  ↓
WORK COMPLETED
  ↓
CLOSED
```

Ngoài luồng chính còn có:

```text
RETURNED
REJECTED
CANCELLED
EXPIRED
```

Approval chain được sinh từ rule engine dựa trên các thuộc tính của permit như loại công việc, risk level, khu vực nguy hiểm và critical work.

### 👥 RBAC

Repository định nghĩa 8 role:

| Role | Ý nghĩa |
|---|---|
| `OIM` | Giàn trưởng |
| `DEPUTY_OIM` | Giàn phó |
| `FPS` | Field Production Supervisor |
| `LINE_SUPERVISOR` | Giám sát trực tiếp |
| `PERMIT_APPLICANT` | Người yêu cầu PTW |
| `PERMIT_CONTROLLER` | PTW Coordinator |
| `HSE` | Bộ phận An toàn |
| `ADMINISTRATOR` | Quản trị hệ thống |

Nguyên tắc chính:

- Default deny cho action không được cấp.
- Line Supervisor chỉ thực hiện recommendation theo permission matrix, không thay thế cấp duyệt cuối.
- Administrator không được dùng quyền quản trị để bypass approval nghiệp vụ.
- UI chỉ là lớp UX/defense-in-depth; backend mới là ranh giới authorization đáng tin cậy.

### ⛽ Gas Test Engine

Các permit yêu cầu Gas Test được đánh giá từ số đo thực tế gồm:

| Thông số | Đơn vị | Ngưỡng đang cấu hình |
|---|---|---|
| O₂ | `%v/v` | 19.5 – 23.5 |
| LEL | `%LEL` | 0 – <10 |
| H₂S | `ppm` | <5 |
| CO | `ppm` | <25 |

Một Gas Test hợp lệ phải:

1. Có đủ bốn phép đo.
2. Tất cả phép đo đạt.
3. Detector còn hạn calibration.
4. Nằm trong khoảng hiệu lực mà engine yêu cầu.

Các ngưỡng trên lấy từ `src/engine/gasTestEngine.ts`/catalog hiện tại và phải được đối chiếu với quy trình chính thức trước khi dùng ngoài môi trường test.

### ⚠️ SIMOPS

Engine SIMOPS phát hiện công việc đồng thời dựa trên:

- Platform.
- Area.
- Khoảng thời gian overlap.
- Compatibility matrix giữa permit types.

Mức xung đột:

```text
NONE
INFO
WARNING
BLOCK
```

Conflict `BLOCK` phải được xử lý/acknowledge theo workflow trước khi tiếp tục.

### 🔁 Revision Management

Permit đã phát hành không sửa trực tiếp như draft. Revision được tạo theo chuỗi:

```text
Issued Permit
     ↓
Request Revision
     ↓
Create New Revision
     ↓
Re-approval
```

Revision giữ số revision, lý do, người tạo, thời gian, snapshot và liên kết giữa bản cũ/bản mới.

### 🧾 Audit Trail

Các thay đổi nghiệp vụ được ghi vào lịch sử trạng thái/audit với dữ liệu như:

- Sequence và event type.
- Trạng thái trước/sau.
- User, role và action.
- Comment.
- Device IP.
- Old/New values.
- Timestamp.

Backend lưu audit record theo hướng append-only và thực hiện mutation nghiệp vụ cùng audit/notification theo transaction phù hợp.

### 🔔 Notifications

Các sự kiện PTW có notification tương ứng, gồm submit, chờ duyệt, return, reject, approve, sắp hết hạn, hết hạn, suspend/resume, cancel, hoàn thành/đóng, SIMOPS conflict, Gas Test fail và calibration due.

---

## 🔐 Kiến trúc bảo mật hiện tại

Phiên bản mới **không còn coi browser là trusted authorization hoặc credential boundary**.

### Frontend

Ứng dụng React/TypeScript dùng Zustand để quản lý state tạm thời và gọi API tại:

```text
/api/ptw
```

Frontend không nên được xem là nguồn sự thật cuối cùng cho:

- Authentication.
- Authorization.
- PIN verification.
- Workflow transition.
- Permit persistence.
- Audit integrity.

### Backend

API chính nằm tại:

```text
offshore-ptw/api/ptw.ts
```

Backend:

- Xác thực đăng nhập.
- Tạo/kiểm tra session HttpOnly.
- Đọc dữ liệu authoritative từ PostgreSQL/Supabase.
- Thực hiện server-side RBAC và ownership checks.
- Re-verify PIN cho mutation nghiệp vụ cần người dùng xác nhận.
- Chạy lại workflow, approval, Gas Test và SIMOPS rules trước khi ghi.
- Ghi permit, audit và notification theo transaction phù hợp.

Các mutation PTW chính gồm:

```text
CREATE_DRAFT
UPDATE_DRAFT
TRANSITION
ADD_GAS_TEST
ACK_SIMOPS
REQUEST_REVISION
REFRESH_EXPIRIES
```

Account và notification mutation dùng các query/RPC riêng.

### Authentication hardening

Backend hiện hỗ trợ các cơ chế:

- Session cookie HttpOnly, có ký.
- Đếm login failure ở server.
- Khóa tài khoản sau 5 lần thất bại liên tiếp trong 15 phút.
- Thay đổi PIN hoặc disable account làm tăng `session_version` để vô hiệu session cũ.
- PIN legacy từ catalog chỉ dùng cho migration; login thành công có thể được nâng cấp sang hash server-side `scrypt$v1`.
- Không yêu cầu các biến `BOOTSTRAP_OIM_*` cũ.

> Không đưa `SUPABASE_SERVICE_ROLE_KEY`, session secret, audit secret hoặc secret server-only vào biến `VITE_*`.

---

## 🗃️ Catalog và dữ liệu cấu hình

File trung tâm:

```text
offshore-ptw/src/data/catalog.ts
```

Catalog hiện chứa dữ liệu cấu hình cho:

- Platforms.
- Areas.
- Equipment.
- Permit types.
- Checklist.
- System accounts.

Danh sách `SYSTEM_ACCOUNTS` là nguồn bootstrap tài khoản hệ thống. Khi database chưa có tài khoản catalog, backend có thể reconcile tài khoản còn thiếu trong quá trình đăng nhập.

**Không đưa PIN thật vào README hoặc tài liệu công khai.**

---

## 🗄️ Database / Supabase

Schema production được quản lý bằng migrations tại:

```text
offshore-ptw/supabase/migrations/
```

Các migration hiện tại phải được áp dụng theo thứ tự:

```text
001_ptw_security.sql
002_ptw_auth_lockout.sql
003_ptw_permit_number_revision_unique.sql
004_ptw_user_transaction.sql
```

Backend sử dụng service-role key để truy cập các bảng server-owned. Client role không được coi là lớp bảo vệ nghiệp vụ.

### Dữ liệu authoritative

Database lưu các nhóm dữ liệu chính:

```text
Users
Permits
Notifications
Audit records
```

Frontend chỉ nhận public/authorized state phù hợp với người dùng hiện tại.

---

## 🔑 Biến môi trường

File mẫu:

```text
offshore-ptw/.env.example
```

Các biến server-side chính:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
PTW_SESSION_SECRET
PTW_AUDIT_SECRET
```

Các secret phải được tạo bằng giá trị ngẫu nhiên đủ dài và chỉ cấu hình trong môi trường server/Vercel.

---

## 🧭 Các route chính

Ứng dụng hiện dùng HashRouter:

| Route | Mục đích |
|---|---|
| `/login` | Đăng nhập |
| `/` | Dashboard |
| `/permits` | Danh sách PTW |
| `/permits/new` | Tạo PTW |
| `/permits/:id` | Chi tiết PTW |
| `/users` | Quản lý người dùng |

URL triển khai tương ứng:

```text
https://offshore-ptw.vercel.app/#/login
```

---

## 🏗️ Cấu trúc thư mục

Cấu trúc quan trọng hiện tại:

```text
quan-ly-gian/
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── auto-merge.yml
├── offshore-ptw/
│   ├── api/
│   │   ├── ptw.ts
│   │   └── *.test.ts
│   ├── src/
│   │   ├── components/
│   │   ├── data/
│   │   │   └── catalog.ts
│   │   ├── engine/
│   │   │   ├── approvalRuleEngine.ts
│   │   │   ├── gasTestEngine.ts
│   │   │   ├── rbacMatrix.ts
│   │   │   ├── simopsEngine.ts
│   │   │   └── workflowStateMachine.ts
│   │   ├── pages/
│   │   ├── services/
│   │   ├── store/
│   │   │   ├── apiClient.ts
│   │   │   └── ptwStore.ts
│   │   └── types/
│   │       └── domain.ts
│   ├── supabase/
│   │   └── migrations/
│   ├── .env.example
│   ├── SECURITY_DEPLOYMENT.md
│   ├── package.json
│   ├── vercel.json
│   ├── vite.config.ts
│   └── tsconfig*.json
└── README.md
```

### Các file nên đọc đầu tiên

```text
src/types/domain.ts
src/data/catalog.ts
src/engine/rbacMatrix.ts
src/engine/approvalRuleEngine.ts
src/engine/workflowStateMachine.ts
src/engine/gasTestEngine.ts
src/engine/simopsEngine.ts
src/services/authorizationService.ts
src/store/apiClient.ts
src/store/ptwStore.ts
api/ptw.ts
SECURITY_DEPLOYMENT.md
supabase/migrations/
```

---

## 💻 Công nghệ

| Công nghệ | Vai trò |
|---|---|
| React 19 | UI |
| TypeScript 7 | Type safety |
| Vite 6 | Frontend build/dev |
| React Router 7 | Routing |
| Zustand 5 | State management |
| Tailwind CSS 4 | Styling |
| Vitest 5 | Unit/API tests |
| CryptoJS | Compatibility/migration hashing trong catalog |
| QRCode React | QR code |
| Node.js 22.x | Runtime yêu cầu |
| Vercel | Frontend + serverless API deployment |
| Supabase/PostgreSQL | Authoritative database |

---

## 🚀 Chạy local

### 1. Clone repository

```bash
git clone https://github.com/dangdinhbaohoang12/quan-ly-gian.git
cd quan-ly-gian/offshore-ptw
```

### 2. Cài dependencies

```bash
npm ci
```

### 3. Cấu hình môi trường server

Copy giá trị mẫu từ `.env.example` và cấu hình các biến server-side trong môi trường local/Vercel.

### 4. Chạy API local

API là Vercel serverless function, vì vậy `npm run dev` **chỉ khởi động Vite** và không tự thực thi `api/ptw.ts`.

Để chạy đầy đủ frontend + API:

```bash
npm i -g vercel
vercel dev
```

Mặc định Vercel dev chạy ở `http://localhost:3000`. Vite đã được cấu hình proxy `/api` tới host này.

Có thể đổi target bằng:

```bash
PTW_API_PROXY_TARGET=http://localhost:3001
```

### 5. Kiểm tra type

```bash
npm run typecheck
npm run typecheck:api
```

### 6. Chạy test

```bash
npm test
```

### 7. Build

```bash
npm run build
```

Build sẽ chạy typecheck frontend, typecheck API rồi mới build Vite.

### 8. Preview

```bash
npm run preview
```

---

## ✅ CI/CD

Workflow CI:

```text
npm ci
  ↓
npm test
  ↓
npm run typecheck
  ↓
npm run build
```

CI chạy trên `ubuntu-latest` với Node.js 22 và lưu `offshore-ptw/dist` thành artifact.

File workflow:

```text
.github/workflows/ci.yml
```

Repository cũng có workflow Final Gate/Auto-Merge:

```text
.github/workflows/auto-merge.yml
```

Workflow này kiểm tra các điều kiện merge trước khi bật Auto-Merge theo cấu hình repository; đây là CI/repository automation, không thay thế authorization của ứng dụng PTW.

---

## 🌍 Deploy Vercel

Vercel nên đặt:

```text
Project Root = offshore-ptw
Build Command = npm run build
Output Directory = dist
```

API serverless:

```text
api/ptw.ts
```

Cấu hình function hiện tại đặt thời gian tối đa 15 giây trong `vercel.json`.

Vì frontend dùng HashRouter, các route UI không cần server rewrite riêng.

### Trình tự triển khai database

Trước khi bật backend production, áp dụng migrations từ `supabase/migrations/` theo đúng thứ tự được mô tả trong phần Database.

Chi tiết security/deployment:

[SECURITY_DEPLOYMENT.md](offshore-ptw/SECURITY_DEPLOYMENT.md)

---

## 🔄 Migration dữ liệu từ bản cũ

Bản backend authoritative bắt đầu với database riêng. Dữ liệu cũ đã từng chỉ nằm trong browser (localStorage/IndexedDB) **không tự động xuất hiện trong database mới**.

Nếu repository trước đây đã có dữ liệu thật trên browser, cần:

```text
Export browser data
      ↓
Transform / re-hash / reconcile IDs
      ↓
Import users
      ↓
Import permits
      ↓
Import notifications
      ↓
Validate counts + IDs + unread state
      ↓
Migrate traffic
```

Không nên chuyển hệ thống có dữ liệu đang dùng sang database mới mà bỏ qua bước kiểm tra migration.

Chi tiết nằm trong [SECURITY_DEPLOYMENT.md](offshore-ptw/SECURITY_DEPLOYMENT.md).

---

## 🧪 Kiểm thử

Vitest chạy cả frontend/domain tests và API tests trong:

```text
src/**/*.test.ts
src/**/*.test.tsx
api/**/*.test.ts
```

Các nhóm kiểm thử quan trọng gồm:

- RBAC và authorization boundary.
- Authentication và lockout.
- PIN migration/upgrade và race conditions.
- Workflow transition.
- Approval chain.
- Draft/revision lifecycle.
- Gas Test validation.
- SIMOPS.
- Audit/traceability.
- API response contract.
- Vercel handler.
- ESM/backend import compatibility.

Lệnh chuẩn:

```bash
npm test
```

---

## ⚠️ Giới hạn và yêu cầu trước production

Một repository có backend an toàn hơn **không đồng nghĩa** với việc đã đạt mọi yêu cầu của một hệ thống PTW safety-critical.

Trước production cần đánh giá tối thiểu:

- Backend authorization và database policy trong môi trường thật.
- Session management, secrets, rotation và incident response.
- Backup, restore và disaster recovery.
- Monitoring và centralized logging.
- Network/security controls phù hợp với môi trường vận hành.
- Quy trình migration dữ liệu hiện hữu.
- Quy trình HSE, approval matrix và competency/certification.
- Ngưỡng Gas Test, SIMOPS và các rule liên quan theo tiêu chuẩn nội bộ.
- Kiểm thử tải, failure modes, concurrency và offline/network recovery.
- Phân quyền vận hành ngoài UI, không chỉ dựa vào hidden button.

---

## 🤝 Đóng góp

Khi thay đổi logic nghiệp vụ, nên cập nhật test tương ứng.

Đặc biệt cần giữ nguyên ranh giới:

```text
UI
 ↓
Authorization / server validation
 ↓
Workflow / Engine
 ↓
Authoritative state mutation
 ↓
Audit / Notification
```

Không giải quyết vấn đề authorization hoặc workflow chỉ bằng cách ẩn/hiện nút trên frontend.

Pull request nên mô tả rõ:

- Thay đổi nghiệp vụ nào.
- Thay đổi security boundary nào (nếu có).
- Test đã chạy.
- Ảnh hưởng migration/database.
- Ảnh hưởng backward compatibility.

---

## 📄 Giấy phép

Dự án được phát hành theo **MIT License**. Xem [LICENSE](LICENSE).

MIT License áp dụng cho mã nguồn của repository này trong phạm vi được chủ sở hữu cấp phép. Các thư viện/phụ thuộc bên thứ ba vẫn chịu license riêng của chúng.

---

## 👤 Tác giả

**Đặng Đình Bảo Hoàng**

GitHub: https://github.com/dangdinhbaohoang12

---

<p align="center">
  <strong>OFFSHORE PTW</strong><br>
  Permit To Work Management System
</p>
