# 🛢️ OFFSHORE PTW

**Hệ thống quản lý Giấy phép Làm việc (Permit To Work - PTW) cho môi trường giàn khoan dầu khí.**

Ứng dụng web tập trung vào việc số hóa vòng đời PTW, kiểm soát phân quyền theo vai trò, chuỗi phê duyệt, kiểm tra khí, SIMOPS, audit trail và các trạng thái vận hành của giấy phép.

> ⚠️ **Lưu ý quan trọng:** Phiên bản hiện tại là một ứng dụng frontend/prototype mô phỏng nghiệp vụ. Dữ liệu và xác thực hiện được xử lý phía trình duyệt, vì vậy **không nên sử dụng trực tiếp làm hệ thống PTW production hoặc nguồn dữ liệu an toàn duy nhất** nếu chưa triển khai backend, cơ chế xác thực và lưu trữ server-side phù hợp.

## 🌐 Demo

**Ứng dụng đang triển khai:**

[https://offshore-ptw.vercel.app/#/login](https://offshore-ptw.vercel.app/#/login)

**Kho lưu trữ:**

[https://github.com/dangdinhbaohoang12/quan-ly-gian](https://github.com/dangdinhbaohoang12/quan-ly-gian)

---

## ✨ Chức năng chính

### 📊 Dashboard

Dashboard là trung tâm theo dõi PTW của ca trực, bao gồm:

- Số lượng permit đang hoạt động.
- Permit đang chờ phê duyệt.
- Permit sắp hết hạn trong vòng 60 phút.
- Permit có Gas Test thất bại.
- Xung đột SIMOPS.
- Danh sách permit đang hoạt động và đang chờ duyệt.
- Hoạt động gần đây từ Audit Trail.
- QR code phục vụ kiểm tra/đối chiếu tại hiện trường.
- Tìm kiếm nhanh theo số permit, khu vực, thiết bị hoặc nội dung công việc.

### 📝 Tạo và quản lý PTW

Màn hình tạo PTW hỗ trợ:

- Sinh tự động số permit theo dạng `PLATFORM-PTW-YYYY-NNNNN`.
- Chọn giàn/platform, khu vực và thiết bị.
- Chọn loại permit.
- Khai báo mức độ rủi ro.
- Khai báo nội dung và lý do phát hành.
- Khai báo thời gian dự kiến bắt đầu/kết thúc.
- Checklist an toàn theo từng loại permit.
- Preview xung đột SIMOPS ngay trong lúc lập permit.
- Chỉnh sửa bản nháp trước khi gửi vào workflow.

### 🔄 Workflow và Approval Chain

Workflow được quản lý bằng state machine thay vì cho phép UI tự thay đổi trạng thái.

Luồng điển hình:

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
APPROVED / ISSUED
  ↓
WORK IN PROGRESS
  ├──→ SUSPENDED
  │      ↓
  │   RESUMED / WORK IN PROGRESS
  │
  ↓
WORK COMPLETED
  ↓
CLOSED
```

Ngoài luồng chính, hệ thống còn hỗ trợ:

```text
RETURNED
REJECTED
CANCELLED
EXPIRED
```

Chuỗi phê duyệt được tạo từ rule engine dựa trên các thuộc tính như:

- Loại permit.
- Risk level.
- Khu vực nguy hiểm.
- Critical work.
- Work classification.
- Điều kiện đặc biệt được engine hỗ trợ.

Điều này cho phép số lượng cấp duyệt thay đổi theo rule thay vì cố định cứng một workflow duy nhất.

---

## 👥 RBAC - Phân quyền

Hệ thống định nghĩa các vai trò:

| Vai trò | Ý nghĩa |
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

- **Default deny:** hành động không có trong permission matrix sẽ bị từ chối.
- Line Supervisor chỉ có quyền **recommend**, không thay cấp trên để `APPROVE`.
- Administrator không được dùng quyền quản trị để bypass nghiệp vụ approval.
- Quyền hiển thị trên UI được kết hợp với kiểm tra workflow trước khi thực thi action.
- Hành động nghiệp vụ quan trọng yêu cầu xác thực bằng PIN của tài khoản.

---

## ⛽ Gas Test Engine

Các permit yêu cầu đo khí được kiểm tra theo dữ liệu đo thay vì chỉ nhập `PASS/FAIL`.

Bốn thông số bắt buộc:

| Thông số | Đơn vị | Ngưỡng hiện tại trong engine |
|---|---|---|
| O₂ | `%v/v` | `19.5` – `23.5` |
| LEL | `%LEL` | `0` – `< 10` |
| H₂S | `ppm` | `< 5` |
| CO | `ppm` | `< 25` |

Một Gas Test chỉ được xem là hợp lệ khi:

1. Có đủ O₂, LEL, H₂S và CO.
2. Tất cả các phép đo đều đạt.
3. Thiết bị đo còn hạn hiệu chuẩn tại thời điểm đo.
4. Phép đo nằm trong khoảng thời gian hiệu lực của hệ thống (mặc định 60 phút khi kiểm tra phát hành/tái phát hành).

> ⚠️ Các ngưỡng trên là **giá trị cấu hình hiện có trong mã nguồn**, không phải tuyên bố về tiêu chuẩn áp dụng cho mọi giàn/khu vực. Khi triển khai thực tế cần đối chiếu với quy trình HSE, permit procedure và tiêu chuẩn của đơn vị vận hành.

---

## ⚠️ SIMOPS Conflict Engine

Hệ thống có engine phát hiện **SIMOPS (Simultaneous Operations)** dựa trên:

- Cùng platform.
- Cùng area.
- Thời gian công việc bị chồng lấn.
- Ma trận tương thích giữa các loại permit.

Mức độ xung đột:

```text
NONE
INFO
WARNING
BLOCK
```

Đặc biệt:

- Xung đột `BLOCK` phải được đánh giá và ghi nhận trước khi submit.
- Mã xung đột được tạo theo cách deterministic để có thể acknowledge ổn định.
- Permit đã bị thay thế bởi revision mới không tiếp tục được tính như permit đang hoạt động.

---

## 🔁 Revision Management

Permit đã phát hành không được sửa trực tiếp như một bản nháp.

Hệ thống hỗ trợ:

```text
Issued Permit
     ↓
Request Revision
     ↓
Create New Revision
     ↓
Re-approval
```

Mỗi revision có thể giữ lại:

- Số revision.
- Lý do revision.
- Người tạo.
- Thời điểm tạo.
- Snapshot của bản permit trước đó.
- Liên kết giữa revision mới và permit đã bị thay thế.

Mục tiêu là bảo toàn lịch sử thay đổi thay vì ghi đè dữ liệu permit cũ.

---

## 🧾 Audit Trail

Mỗi thay đổi workflow được ghi lại trong `statusHistory`.

Audit entry có thể chứa:

- Sequence.
- Trạng thái trước/sau.
- Loại sự kiện.
- Người thực hiện.
- Vai trò.
- Action.
- Comment.
- Device IP.
- Old values / New values.
- Timestamp.

UI có màn hình hiển thị Audit Trail dưới dạng nhật ký phục vụ việc truy vết.

---

## 🔐 Chữ ký điện tử trong prototype

Các action quan trọng sử dụng PIN của tài khoản để tạo `signatureHash`.

Mục đích của cơ chế này trong prototype là:

- Xác nhận người thực hiện action.
- Gắn chữ ký vào bước phê duyệt.
- Cho phép truy vết người đã ký.
- Kết hợp với thông tin thời gian và thiết bị.

**Không nên coi đây là cơ chế chữ ký điện tử production.** Trong phiên bản hiện tại, dữ liệu xác thực và logic hashing tồn tại trong frontend/public source. Hệ thống production cần chuyển xác thực, secret/pepper, authorization và audit integrity sang backend đáng tin cậy.

---

## 🔔 Notifications

Store hỗ trợ notification theo các sự kiện PTW như:

- PTW mới được submit.
- Đang chờ phê duyệt.
- PTW bị trả về.
- PTW bị từ chối.
- PTW được phê duyệt.
- Sắp hết hạn.
- Hết hạn.
- Đình chỉ / tiếp tục.
- Hủy.
- Hoàn thành / đóng.
- SIMOPS conflict.
- Gas Test thất bại.
- Calibration đến hạn.

---

## 🧭 Các trang chính

```text
/login
/
 /permits
 /permits/new
 /permits/:id
 /users
```

Trong đó:

| Route | Mục đích |
|---|---|
| `/login` | Đăng nhập |
| `/` | Dashboard |
| `/permits` | Danh sách PTW |
| `/permits/new` | Tạo PTW |
| `/permits/:id` | Chi tiết PTW |
| `/users` | Quản lý tài khoản |

Ứng dụng sử dụng **HashRouter**, vì vậy các route khi deploy dạng static có dạng:

```text
https://offshore-ptw.vercel.app/#/login
```

---

## 🏗️ Kiến trúc

Thư mục ứng dụng chính:

```text
offshore-ptw/
├── src/
│   ├── components/
│   │   ├── layout/
│   │   ├── permit/
│   │   └── ui/
│   ├── data/
│   │   └── catalog.ts
│   ├── engine/
│   │   ├── approvalRuleEngine.ts
│   │   ├── gasTestEngine.ts
│   │   ├── rbacMatrix.ts
│   │   ├── simopsEngine.ts
│   │   └── workflowStateMachine.ts
│   ├── lib/
│   ├── pages/
│   │   ├── DashboardPage.tsx
│   │   ├── LoginPage.tsx
│   │   ├── PermitDetailPage.tsx
│   │   ├── PermitFormPage.tsx
│   │   ├── PermitListPage.tsx
│   │   └── UsersAdminPage.tsx
│   ├── services/
│   │   └── authorizationService.ts
│   ├── store/
│   │   └── ptwStore.ts
│   ├── types/
│   │   └── domain.ts
│   ├── App.tsx
│   ├── index.css
│   └── main.tsx
├── package.json
├── package-lock.json
├── tsconfig.json
└── vite.config.ts
```

### Các lớp chính

**`types/`**  
Định nghĩa domain model, role, action, permit status, approval step, notification và audit entry.

**`engine/`**  
Chứa business rules quan trọng:

- `rbacMatrix.ts` - permission matrix.
- `approvalRuleEngine.ts` - sinh approval chain.
- `workflowStateMachine.ts` - chuyển trạng thái PTW.
- `gasTestEngine.ts` - tính toán và kiểm tra gas test.
- `simopsEngine.ts` - phát hiện xung đột công việc đồng thời.

**`services/`**  
Tầng authorization giúp UI xác định action nào thực sự khả dụng với user và permit hiện tại.

**`store/`**  
Zustand store quản lý user, permit, notification và các thao tác nghiệp vụ.

**`pages/`**  
Các màn hình ứng dụng.

**`components/permit/`**  
Các thành phần dùng chung cho approval, gas test, SIMOPS và audit trail.

---

## 💻 Công nghệ

| Công nghệ | Vai trò |
|---|---|
| React 19 | UI |
| TypeScript | Type safety |
| Vite 6 | Build/dev server |
| React Router 7 | Routing |
| Zustand 5 | State management |
| Tailwind CSS 4 | Styling |
| Vitest 5 | Unit/critical tests |
| CryptoJS | Hashing trong prototype |
| `qrcode.react` | QR code |
| Node.js 22.x | Runtime yêu cầu của package |

---

## 🚀 Cài đặt local

### 1. Clone repository

```bash
git clone https://github.com/dangdinhbaohoang12/quan-ly-gian.git
cd quan-ly-gian/offshore-ptw
```

### 2. Cài dependencies

```bash
npm ci
```

### 3. Chạy development server

```bash
npm run dev
```

Sau đó mở địa chỉ Vite hiển thị trong terminal, thường là:

```text
http://localhost:5173
```

### 4. Kiểm tra type

```bash
npm run typecheck
```

### 5. Chạy test

```bash
npm test
```

### 6. Build production

```bash
npm run build
```

### 7. Preview build

```bash
npm run preview
```

---

## ✅ CI/CD

Repository có GitHub Actions workflow kiểm tra chất lượng mã nguồn.

Workflow CI hiện chạy:

```text
npm ci
  ↓
npm test
  ↓
npm run typecheck
  ↓
npm run build
```

CI chạy trên `ubuntu-latest` với Node.js 22 và lưu thư mục build `offshore-ptw/dist` thành artifact.

Workflow nằm tại:

```text
.github/workflows/ci.yml
```

Repository cũng chứa workflow tự động xử lý điều kiện auto-merge ở:

```text
.github/workflows/auto-merge.yml
```

---

## 🌍 Deploy

Ứng dụng được thiết kế để deploy dạng static frontend và hiện đang được triển khai trên Vercel.

### Build command

```bash
npm run build
```

### Output

```text
offshore-ptw/dist
```

Khi deploy, project root cần trỏ vào thư mục:

```text
offshore-ptw
```

Do ứng dụng sử dụng `HashRouter`, không cần cấu hình rewrite server cho các route nội bộ.

---

## ⚠️ Giới hạn hiện tại

Phiên bản hiện tại phù hợp cho **prototype, mô phỏng nghiệp vụ, UI validation và development**.

Một số điểm cần nâng cấp trước khi sử dụng production:

- Đưa authentication và authorization sang backend.
- Không lưu state nghiệp vụ quan trọng chỉ trong browser `localStorage`.
- Lưu audit log ở server/database có kiểm soát integrity.
- Không để secret/pepper dùng cho xác thực trong public frontend source.
- Thực hiện server-side enforcement cho mọi workflow transition.
- Đồng bộ dữ liệu giữa nhiều người dùng và nhiều thiết bị.
- Bổ sung cơ chế session/token, timeout và revoke.
- Bổ sung cơ chế phân quyền server-side độc lập với UI.
- Kiểm soát thiết bị, IP và mạng LAN ở tầng backend/network.
- Có database thật thay cho state trong trình duyệt.
- Bổ sung backup, recovery, monitoring và logging tập trung.
- Đánh giá lại tất cả quy tắc HSE/approval/gas test theo quy trình chính thức của đơn vị vận hành.

---

## 🧪 Kiểm thử

Các bài kiểm thử nghiệp vụ quan trọng nằm trong:

```text
offshore-ptw/src/critical.test.ts
```

Một số nhóm logic được kiểm thử bao gồm:

- RBAC.
- Workflow transition.
- Approval chain.
- Revision.
- Gas Test.
- SIMOPS.
- Audit/traceability.
- Các trường hợp biên của permit lifecycle.

Chạy toàn bộ test:

```bash
npm test
```

Chạy test ở chế độ watch:

```bash
npm run test:watch
```

---

## 📚 Mã nguồn quan trọng

Các file nên đọc đầu tiên khi phát triển dự án:

```text
src/types/domain.ts
src/engine/rbacMatrix.ts
src/engine/approvalRuleEngine.ts
src/engine/workflowStateMachine.ts
src/engine/gasTestEngine.ts
src/engine/simopsEngine.ts
src/services/authorizationService.ts
src/store/ptwStore.ts
```

---

## 🤝 Đóng góp

Khi thay đổi logic PTW, đặc biệt là:

- workflow,
- RBAC,
- approval,
- gas test,
- SIMOPS,
- revision,
- audit,

nên đồng thời cập nhật test tương ứng.

Mọi thay đổi nghiệp vụ quan trọng cần đảm bảo:

```text
UI
 ↓
Authorization
 ↓
Workflow / Engine
 ↓
State update
 ↓
Audit / Notification
```

Không nên chỉ sửa điều kiện hiển thị nút ở UI để giải quyết vấn đề quyền hoặc workflow.

---

## 📄 Giấy phép

Repository hiện chưa khai báo một license mở cụ thể trong README này. Trước khi tái sử dụng hoặc phân phối dự án, hãy kiểm tra và bổ sung license phù hợp cho repository.

---

## 👤 Tác giả

**Đặng Đình Bảo Hoàng**

GitHub: [@dangdinhbaohoang12](https://github.com/dangdinhbaohoang12)

---

<p align="center">
  <strong>OFFSHORE PTW</strong><br>
  Safety-Critical Permit To Work Management System
</p>
