# Virtua Scroll Restoration Blank Viewport — Minimal Reproduce Project

โปรเจกต์ Minimal Reproduce แบบ Standalone สำหรับทดสอบและพิสูจน์บั๊ก **Blank Viewport during Scroll Restoration** ของ `virtua` (`WindowVirtualizer`) เปรียบเทียบกับ `@tanstack/react-virtual` (`useWindowVirtualizer`)

---

## วิธีเริ่มรันโปรเจกต์

```bash
cd /home/jame/work/sp/virtua-repro
npm run dev
# หรือ npx vite
```

เปิดเบราว์เซอร์ไปที่: `http://localhost:5173/`

---

## วิธีทดสอบเพื่อ Reproduce อาการบั๊ก

### วิธีที่ 1: Navigation Back จริง (User Flow ปกติ)
1. เลื่อน Scroll ลงไปแถวๆ Item #20 (~1600px)
2. คลิกที่ Item #20 เพื่อเข้าหน้า Detail (ตำแหน่งหน้าต่างในหน้า Detail จะอยู่ที่ 0px)
3. คลิกปุ่ม **`← Back to List (Restores Scroll)`** (หรือกดปุ่ม Back ของ Browser)
4. **จะเห็นแถบสีแดง 🔴 `✗ BUG: BLANK VIEWPORT!` ทันที และหน้าจอว่างเปล่า**
   - `window.scrollY` ถูก restore กลับมาที่ `1600px` เรียบร้อยแล้ว
   - แต่ Virtua ไม่ได้ sync scroll offset ตอน mount ทำให้วาด Item `#0..#12` ไว้ที่ `0px`–`960px` (อยู่นอกระยะสายตาข้างบน)
5. สะกิดล้อเมาส์ / trackpad เพียง 1px หรือคลิกปุ่ม **`Scroll +1px`**:
   - จะเกิด event `scroll` ทำให้ Virtua ดีด Item `#15..#30` ขึ้นมาบนหน้าจอทันที (เปลี่ยนเป็นแถบสีเขียว 🟢)

### วิธีที่ 2: ปุ่มลัด `⚡ Remount at 1600px`
- คลิกปุ่ม **`⚡ Remount at 1600px`** บน Top Header
- ระบบจะ unmount และ remount list กลับมาที่ 1600px ทันที (จำลองการเปลี่ยนแท็บหรือ client-side route replacement)
- จะเห็นอาการจอขาว 🔴 `✗ BUG: BLANK VIEWPORT!` ทันที

### วิธีที่ 3: ปุ่มจำลองอัตโนมัติ `→ Run Auto-Repro Test`
- คลิกปุ่ม **`→ Run Auto-Repro Test`** เพื่อให้โปรแกรมรัน sequence อัตโนมัติ (Scroll 1600px $\rightarrow$ Detail $\rightarrow$ Back)

### เปรียบเทียบกับ TanStack Virtual
1. คลิกปุ่ม **`Switch to TanStack`**
2. ทำตามวิธีที่ 1 หรือ 2 ซ้ำอีกครั้ง
3. สังเกตว่า `@tanstack/react-virtual` จะเรนเดอร์ Item `#18..#31` ขึ้นมาทันทีโดยไม่มีอาการจอขาว เพราะรองรับ `initialOffset: () => window.scrollY`

---

## ผลการรันพิสูจน์จริงใน Chromium (Empirical Verification)

เมื่อจำลองการ Navigation Back กลับมาที่ตำแหน่ง `window.scrollY = 1600px`:

| Library | Rendered Count | Rendered Indices | In Viewport? | ผลลัพธ์ที่ตาเห็น |
| :--- | :---: | :---: | :---: | :--- |
| **`virtua` (`WindowVirtualizer`)** | **`13`** | **`#0 .. #12`** (อยู่นอกจอ 0–960px) | 🔴 **`false`** | **จอขาวว่างเปล่า (Blank Viewport)** |
| **`@tanstack/react-virtual`** | **`14`** | **`#18 .. #31`** (อยู่ในจอ 1440–2480px) | 🟢 **`true`** | **รายการแสดงทันทีก่อน Paint** |

## โครงสร้างไฟล์ในโปรเจกต์นี้

```
virtua-repro/
├── index.html
├── package.json
├── vite.config.ts
├── src/
│   ├── main.tsx
│   └── App.tsx     # ตัวอย่างโค้ดเปรียบเทียบทั้ง 2 library พร้อม Router จำลอง
├── virtua-github-issue.md  # Template พร้อมส่ง Issue ไปที่ inokawa/virtua
├── virtua-github-pr.md     # Template พร้อม Git patch สำหรับส่ง PR
└── README.md
```
