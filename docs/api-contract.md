# 青海巡查系统 API 静态契约

本文档来自 2026-07-27 对官方前端静态 bundle 的只读分析。分析范围：

- `app.3cf6308c7898edba5169.1784626810420.js`
- `676.3cf6308c7898edba5169.1784626810420.js`：现场记录列表
- `1091.3cf6308c7898edba5169.1784626810420.js`：排班管理
- `675.3cf6308c7898edba5169.1784626810420.js`：日志列表
- `610.3cf6308c7898edba5169.1784626810420.js`：青海/云南日志编辑
- app 路由声明引用的静态依赖：
  - `1090...js`：现场记录新增、编辑、详情
  - `1286...js`：日志内新增现场记录
  - `151...js`：现场记录附件上传组件
  - `82...js`：排班公共组件

本次没有调用新增、更新或删除接口，也没有读取密码文件或记录任何真实凭据。

## 1. 通用传输约定

### 1.1 基地址与认证

业务 URL 均为相对路径，由官方前端的 Axios 实例挂到当前系统 API 基地址。

请求拦截器会加入：

```http
Authorization: Bearer <当前登录会话凭据>
source: vue
```

除显式关闭外，请求 URL 还会追加 `time=<当前毫秒时间戳>`。该参数用于防缓存，不属于业务查重键。

自动化实现应复用用户在官方页面完成登录后的会话，不应把凭据写入配置、日志或本文档。

### 1.2 JSON POST 的实际编码

现场记录、排班和日志的新增/更新函数均把普通 JavaScript 对象放在 Axios `data` 中。Axios 会把对象序列化为 JSON 文本。

需要注意：该版本 Axios 的 `POST` 默认头是：

```http
Content-Type: application/x-www-form-urlencoded
```

由于前端未在这些接口上显式覆盖 `headers.Content-Type`，静态代码推导出的实际请求是：

- body：JSON 文本
- header：`application/x-www-form-urlencoded`

这不是标准的表单键值编码。兼容官方前端时应优先复刻“JSON body + 该 header”的行为；在生产实现前仍建议用浏览器 Network 面板对一次只读或用户主动提交操作确认网关是否改写了请求头。

### 1.3 文件上传

文件上传使用原生 `FormData`。浏览器负责写入带 boundary 的有效头：

```http
Content-Type: multipart/form-data; boundary=...
```

不要手工固定 boundary。

### 1.4 通用响应 envelope

页面统一按以下结构读取响应：

```json
{
  "code": 200,
  "msg": "操作结果文本",
  "data": {}
}
```

前端同时存在 `200 == response.code` 和 `"200" == response.code`，因此 `code` 可能是数字或字符串。

分页响应：

```json
{
  "code": 200,
  "msg": "",
  "data": {
    "records": [],
    "total": 0
  }
}
```

分页对象可能还有 `current`、`size`、`pages` 等后端分页字段，但目标页面只依赖 `records` 和 `total`。

## 2. 现场记录

### 2.1 接口清单

| 用途 | Method | Path | 参数位置 |
| --- | --- | --- | --- |
| 分页/日期查询 | GET | `/check/record/cheRecordPageList` | query |
| 详情 | GET | `/check/record/cheRecordDetail` | query |
| 新增或更新 | POST | `/check/record/addCheRecord` | JSON body |
| 在指定日志内新增 | POST | `/check/record/checkLogAddCheRecord/{checklogId}` | JSON body + path |
| 批量删除 | POST | `/check/record/deleteCheRecordByIds` | JSON body |
| 查询日志关联记录 | GET | `/check/record/getCheRecordLog` | query |
| 附件上传 | POST | `/system/sys/file/uploadCommon` | multipart body |
| 删除已上传附件 | GET | `/system/sys/file/delete/{storageId}` | path |
| 下载/预览附件 | GET | `/system/sys/file/getFileStreamByStorageId/{storageId}` | path |

没有发现独立的 `updateCheRecord`。编辑页仍调用 `addCheRecord`，是否更新由 body 中已有的 `recordId` 决定。

### 2.2 列表查询

```http
GET /check/record/cheRecordPageList
```

页面可发送的 query：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `current` | number | 页码 |
| `size` | number | 每页数量；查重建议 `-1` |
| `oid` | string | 执法机构 ID |
| `checkStartTime` | string | `yyyy-MM-dd HH:mm:ss` |
| `checkEndTime` | string | `yyyy-MM-dd HH:mm:ss` |
| `checkCategory` | string | 检查门类 ID |
| `checkType` | string | 青海页面允许直接传巡查重点文本 |
| `isCase` | string | `"true"` / `"false"` / 空 |
| `personName` | string | 执法人员姓名查询 |
| `personIds` | string | 日志关联记录弹窗使用的人员 ID 串 |

日期选择器先生成 `checkStartTime`、`checkEndTime`，临时 UI 字段 `checkTime` 会在请求前清空。

用于日志关联记录时，页面发送：

```json
{
  "checkStartTime": "2026-07-26 08:00:00",
  "checkEndTime": "2026-07-26 18:00:00",
  "personIds": "user-id-1,user-id-2",
  "current": 1,
  "size": 10
}
```

响应 `data.records[]` 至少包含页面读取的：

- `recordId`
- `recordNum`
- `checkStartTime`
- `checkEndTime`
- `checkCategoryName`
- `checkTypeName` / `checkType`
- `personIds`
- `personName`
- `roadNum`
- `roadName`
- `roadCondition`
- `describes`
- `oid`

服务端返回的 `personIds` 在部分页面按分号拆分；新增请求中的人员串则由页面以逗号拼接。自动化比较时应把逗号、分号都视为分隔符并按集合归一化。

### 2.3 详情

```http
GET /check/record/cheRecordDetail?recordId=<recordId>
```

成功响应：

```json
{
  "code": 200,
  "msg": "",
  "data": {
    "recordId": "...",
    "listAtt": [],
    "listPer": [],
    "listAbn": [],
    "listCaseDocs": []
  }
}
```

`data` 本身就是编辑表单对象。页面会额外执行：

- `roadNum`: 青海数据从逗号串转为数组
- `roadName`: 青海数据从逗号串转为数组
- `listPer`: 根据 `personId` 反查人员选择项
- `listAtt`: 直接用于附件表格
- `listCaseDocs`: 用于已生成文书

### 2.4 附件上传

```http
POST /system/sys/file/uploadCommon
Content-Type: multipart/form-data; boundary=...
```

表单字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `file` | binary，可重复 | 每个待上传文件执行一次 `formData.append("file", file)` |

前端限制提示为单文件不超过 5 MB，但当前代码只显示警告，没有阻止超限文件进入 `fileList`。自动化端应主动执行大小校验。

成功响应：

```json
{
  "code": 200,
  "msg": "",
  "data": [
    {
      "storagePath": "...",
      "storageId": "...",
      "fileName": "规范文件名.jpg"
    }
  ]
}
```

上传组件把响应转换为现场记录附件：

```json
{
  "path": "<storagePath>",
  "storageId": "<storageId>",
  "name": "<fileName>"
}
```

随后将这些对象放入 `addCheRecord.listAtt`。附件文件名应在上传前完成规范化，因为服务端返回的 `fileName` 被直接作为最终 `name`。

### 2.5 `addCheRecord` 精确 payload

```http
POST /check/record/addCheRecord
```

青海正常巡查的前端组装逻辑：

1. 固定设置 `cateId = "1002000100000000"`、`cateName = "公路路政"`。
2. 根据人员选择生成 `listPer`。
3. 同时生成带尾逗号的 `personIds`、`personName`、`certificateId`。
4. 设置 `listAtt` 和 `listCaseDocs`。
5. 青海的 `roadNum[]`、`roadName[]` 以逗号连接后提交。
6. 新增和编辑均提交到同一接口；编辑 payload 保留 `recordId`。

完整字段集合：

| 字段 | 类型 | 新增要求 | 说明 |
| --- | --- | --- | --- |
| `recordId` | string | 更新时必需 | 存在时走更新语义 |
| `oid` | string | 可省略 | 新增页未主动写入，服务端可从会话推断；编辑详情通常带回 |
| `checkStartTime` | string | 必需 | `yyyy-MM-dd HH:mm:ss` |
| `checkEndTime` | string | 必需 | `yyyy-MM-dd HH:mm:ss` |
| `checkCategory` | string | 必需 | “检查门类”字典 ID |
| `checkType` | string | 必需 | 青海巡查重点；历史响应还可能有 `checkTypeName` |
| `address` | string | 可选 | 填报地点 |
| `cateId` | string | 必需 | 固定 `1002000100000000` |
| `cateName` | string | 必需 | 固定 `公路路政` |
| `roadCondition` | string | 必需 | `"1"` 正常，`"2"` 异常 |
| `drivingDirection` | string | 可选 | 字典项的 `notes`，不是字典 ID |
| `roadNum` | string | 必需 | 青海多选值以逗号连接 |
| `roadName` | string | 必需 | 青海多选值以逗号连接 |
| `startKilometer` | string/number | 可选 | 起点 K 值 |
| `startMeter` | string/number | 可选 | 起点米值 |
| `endKilometer` | string/number | 可选 | 终点 K 值 |
| `endMeter` | string/number | 可选 | 终点米值 |
| `desTemplateId` | string | 可选 | 描述模板 ID |
| `describes` | string | 通常必需 | 现场记录正文 |
| `personIds` | string | 必需 | 页面生成 `id1,id2,` |
| `personName` | string | 必需 | 页面生成 `姓名1,姓名2,` |
| `certificateId` | string | 可选 | 页面生成 `证号1,证号2,` |
| `listPer` | array | 必需 | 人员结构数组 |
| `listAtt` | array | 可空 | 已上传附件 |
| `listAbn` | array | 正常可空 | 异常处置结构 |
| `listCaseDocs` | array | 可空 | 关联文书 |
| `caseDoctypeId` | string | 可选 | 已勾选文书 ID 串 |
| `carCondition` | string | 可选 | 默认 `完好` |
| `carConditionDescribe` | string | 可选 | 车辆说明 |
| `equipmentCondition` | string | 可选 | 默认 `齐全` |
| `equipmentConditionDescribe` | string | 可选 | 装备说明 |
| `includingPeople` | string | 可选 | 交班相关字段 |
| `successor` | string | 可选 | 交班相关字段 |
| `manager` | string | 可选 | 负责人 |

`listPer[]`：

```json
[
  {
    "personId": "<userId>",
    "personName": "<lawOfficerName>",
    "createId": "<当前用户 id>",
    "mobile": "<手机号，可省略>"
  }
]
```

`listAtt[]`：

```json
[
  {
    "path": "<storagePath>",
    "storageId": "<storageId>",
    "name": "<fileName>"
  }
]
```

正常巡查的推荐最小示例：

```json
{
  "checkStartTime": "2026-07-26 08:31:00",
  "checkEndTime": "2026-07-26 12:05:00",
  "checkCategory": "<巡查检查门类字典 ID>",
  "checkType": "公路路面、公路附属设施、公路用地及建筑控制区监管",
  "address": "",
  "cateId": "1002000100000000",
  "cateName": "公路路政",
  "roadCondition": "1",
  "drivingDirection": "<字典 notes 或空>",
  "roadNum": "G6",
  "roadName": "京藏高速公路",
  "startKilometer": "1766",
  "startMeter": "600",
  "endKilometer": "1800",
  "endMeter": "500",
  "describes": "<巡查正文>",
  "personIds": "<id1>,<id2>,",
  "personName": "<姓名1>,<姓名2>,",
  "certificateId": "<证号1>,<证号2>,",
  "listPer": [],
  "listAtt": [],
  "listAbn": [],
  "listCaseDocs": []
}
```

页面初始状态虽然给 `listAbn` 放入一个空对象，但在 `roadCondition = "1"` 时语义上应提交空数组，避免产生空异常记录。

### 2.6 日志内直接新增现场记录

```http
POST /check/record/checkLogAddCheRecord/{checklogId}
```

payload 与 `addCheRecord` 基本相同，差异是：

- 日志编辑页把记录时间限制在日志 `startCheckTime` 至 `endCheckTime` 内。
- 保存时通过 path 中的 `checklogId` 直接建立关联。
- 该页面没有青海主记录页的 `roadNum` / `roadName` 数组转逗号逻辑；调用方应自行确保提交字符串。

### 2.7 删除

```http
POST /check/record/deleteCheRecordByIds
```

body：

```json
{
  "ids": ["record-id-1", "record-id-2"]
}
```

附件删除不是该接口：

```http
GET /system/sys/file/delete/{storageId}
```

### 2.8 现场记录同日查重

前端没有专门的唯一性接口。建议新增前执行：

```http
GET /check/record/cheRecordPageList
  ?oid=<organId>
  &checkStartTime=2026-07-26 00:00:00
  &checkEndTime=2026-07-26 23:59:59
  &current=1
  &size=-1
```

比较键按优先级：

1. `recordId`：已知 ID 时直接更新。
2. 同机构 + 同巡查起止时间 + 相同人员集合 + 相同 `roadNum`/`roadName`。
3. 时间存在小误差时，再比较 `describes` 中路线、关键点和附件 `storageId`/文件内容哈希。

不要仅按日期或路线查重：同一天可有多辆车并行巡查同一路线，也可一辆车分多个时间段重复巡查。

## 3. 排班管理

### 3.1 接口清单

| 用途 | Method | Path | 参数位置 |
| --- | --- | --- | --- |
| 列表/当日详情 | GET | `/check/schedule/cheSchedulePageList` | query |
| 新增 | POST | `/check/schedule/addCheSchedule` | JSON body |
| 更新 | POST | `/check/schedule/updateCheSchedule` | JSON body |
| 删除 | GET | `/check/schedule/deleteCheScheduleById/{scheduleId}` | path |

没有独立详情接口。编辑使用列表响应中的完整行对象。

### 3.2 当日列表

页面查询：

```http
GET /check/schedule/cheSchedulePageList
  ?size=-1
  &cateId=<公路路政门类 ID>
  &startTime=2026-07-26
```

可选分页字段为 `current`、`size`，日期区间查询还可传 `endTime`，页面会把结束日期扩展到 `23:59:59`。

成功响应：

```json
{
  "code": 200,
  "msg": "",
  "data": {
    "records": [
      {
        "scheduleId": "...",
        "startTime": "2026-07-26 08:00:00",
        "endTime": "2026-07-26 18:00:00",
        "lawEnforcementOfficials": "姓名1;姓名2",
        "lawEnforcementOfficialsIds": "id1;id2",
        "patrolRoute": "路线1;路线2",
        "content": "巡查重点"
      }
    ],
    "total": 1
  }
}
```

### 3.3 新增 payload

```http
POST /check/schedule/addCheSchedule
```

业务字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `cateId` | string | 排班门类 ID |
| `cateName` | string | 排班门类名称 |
| `patrolType` | string | 青海支持 `路巡`、`重点路段视频巡查` |
| `startTime` | string | `yyyy-MM-dd HH:mm:ss` |
| `endTime` | string | `yyyy-MM-dd HH:mm:ss` |
| `isUseCar` | string | `"1"` 是，`"0"` 否 |
| `plateNumbers` | string | 车牌号 |
| `lawEnforcementOfficials` | string | 姓名以分号连接 |
| `lawEnforcementOfficialsIds` | string | 用户 ID 以分号连接 |
| `schedulePersonnel` | string | 排班人员昵称 |
| `schedulePersonnelId` | string | 排班人员用户 ID |
| `patrolRoute` | string | 多条路线以分号连接 |
| `times` | number | 青海巡查次数，UI 限制 1 至 9999 |
| `content` | string | 青海页面名称为“巡查重点” |
| `oid` | string | 当前机构 ID |
| `approve` | boolean/number/null | 新增默认 `null` |

官方页面还会把以下 UI 辅助字段一起克隆进 payload：

```json
{
  "scheduleTime": [
    "2026-07-26 08:00:00",
    "2026-07-26 18:00:00"
  ],
  "lawPersonListIndex": [0, 1]
}
```

后端显然能忽略这两个字段。自动化可省略它们，保留规范化后的业务字段。

示例：

```json
{
  "cateId": "<公路路政门类 ID>",
  "cateName": "公路路政",
  "patrolType": "路巡",
  "startTime": "2026-07-26 08:00:00",
  "endTime": "2026-07-26 18:00:00",
  "isUseCar": "1",
  "plateNumbers": "青A8A971",
  "lawEnforcementOfficials": "宁戎;杨富强",
  "lawEnforcementOfficialsIds": "<id1>;<id2>",
  "schedulePersonnel": "<当前排班人>",
  "schedulePersonnelId": "<当前排班人 id>",
  "patrolRoute": "G6京藏高速公路西过境段",
  "times": 1,
  "content": "公路路面、公路附属设施、公路用地及建筑控制区监管",
  "oid": "<organId>",
  "approve": null
}
```

### 3.4 更新

```http
POST /check/schedule/updateCheSchedule
```

body 与新增相同，并必须保留：

```json
{
  "scheduleId": "<existing scheduleId>"
}
```

编辑页通过 `Object.assign` 复制整个列表行，因此官方前端可能把创建时间、状态等只读字段也原样传回。自动化应发送上表业务字段和 `scheduleId`，避免依赖无关元数据。

### 3.5 删除

```http
GET /check/schedule/deleteCheScheduleById/{scheduleId}
```

无业务 body。

### 3.6 排班同日查重

查询当天全部排班后，不能只按日期判重。建议使用：

```text
cateId
+ startTime/endTime
+ plateNumbers
+ lawEnforcementOfficialsIds 集合
+ patrolRoute 集合
```

判断规则：

- 完全匹配：复用 `scheduleId`。
- 同车、同人员、同路线但时间变化：更新原排班。
- 同日时间重叠但车牌或人员集合不同：视为并行排班，分别保留。
- 同车在相邻但不重叠时段巡查不同路线：按业务选择一个多路线排班或多个排班，不能仅按车牌覆盖。

## 4. 日志管理

### 4.1 接口清单

| 用途 | Method | Path | 参数位置 |
| --- | --- | --- | --- |
| 列表/详情 | GET | `/check/checklog/cheChecklogPageList` | query |
| 新增 | POST | `/check/checklog/addCheChecklog` | JSON body |
| 更新 | POST | `/check/checklog/updateCheChecklog` | JSON body |
| 删除 | GET | `/check/checklog/deleteCheChecklogById/{checklogId}` | path |
| 查询关联现场记录 | GET | `/check/record/getCheRecordLog` | query |
| 查询机构车牌列表 | GET | `/check/checklog/getPlateNumbers/{organId}` | path |

没有独立日志详情接口。编辑页使用：

```http
GET /check/checklog/cheChecklogPageList?checklogId=<checklogId>
```

并取 `data.records[0]`。

### 4.2 列表查询

页面发送：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `oName` | string | 执法机构名称 |
| `schedulePersonnel` | string | 排班人员 |
| `patrolRoute` | string | 巡查路线 |
| `lawEnforcementOfficials` | string | 执法人员 |
| `patrolType` | string | 巡查类型 |
| `status` | string | 状态 |
| `createTime` | string | 填报日期，`yyyy-MM-dd` |
| `current` | number | 页码 |
| `size` | number | 每页数量 |
| `checklogId` | string | 精确读取某条日志时使用 |

响应记录至少包含：

- `checklogId`
- `title`
- `oid`
- `oname`
- `startCheckTime`
- `endCheckTime`
- `createTime`
- `scheduleId`
- `schedulePersonnel`
- `schedulePersonnelId`
- `patrolType`
- `patrolRoute`
- `isUseCar`
- `plateNumbers`
- `lawEnforcementOfficials`
- `lawEnforcementOfficialsIds`
- `weather`
- `inspectionLength`
- `roadCondition`
- `roadProductCondition`
- `buildControlCondition`
- `checkProblem`
- `disposed`
- `stayDisposed`
- `other`
- `saveStatus`
- `storageId`

### 4.3 关联排班

日志“关联排班”弹窗按当天查询：

```http
GET /check/schedule/cheSchedulePageList
  ?cateId=<businessType>
  &startTime=2026-07-26
  &current=1
  &size=<pageSize>
```

选中排班后转换：

- `lawEnforcementOfficialsIds`: 排班分号串转数组
- `patrolRoute`: 排班分号串转数组
- `scheduleId`: 直接复制
- `isUseCar`, `plateNumbers`, `patrolType`: 直接复制
- `schedulePersonnel`, `schedulePersonnelId`: 直接复制

日志最终提交时，人员 ID 和路线改为逗号连接。

### 4.4 关联现场记录

```http
GET /check/record/getCheRecordLog?checklogId=<checklogId>
```

响应：

```json
{
  "code": 200,
  "msg": "",
  "data": [
    {
      "recordId": "...",
      "describes": "..."
    }
  ]
}
```

新增日志选择记录时仍使用 `cheRecordPageList`，并传日志时间范围和人员 ID；已选择的 `recordId` 由前端本地排除。

### 4.5 `addCheChecklog` 精确 payload

```http
POST /check/checklog/addCheChecklog
```

完整字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `checklogId` | string | 新增时通常为空；暂存后继续编辑会带回 |
| `title` | string | 日志标题 |
| `patrolType` | string | 默认 `路巡` |
| `status` | string | 页面对象可能为空/未定义 |
| `startCheckTime` | string | `yyyy-MM-dd HH:mm:ss` |
| `endCheckTime` | string | `yyyy-MM-dd HH:mm:ss` |
| `weather` | string | `"1"` 晴、`"2"` 阴、`"3"` 风、`"4"` 雨、`"5"` 雪 |
| `scheduleId` | string | 关联排班 ID |
| `recordsIds` | string | 现场记录 ID 以逗号连接 |
| `isUseCar` | string | `"1"` / `"0"` |
| `plateNumbers` | string | 车牌号 |
| `lawEnforcementOfficials` | string | 姓名以逗号连接 |
| `lawEnforcementOfficialsIds` | string | 用户 ID 以逗号连接 |
| `patrolRoute` | string | 路线以逗号连接 |
| `schedulePersonnel` | string | 排班人员 |
| `schedulePersonnelId` | string | 排班人员 ID |
| `inspectionLength` | string/number | 巡查里程，单位 km |
| `roadCondition` | string | 路面情况 |
| `roadProductCondition` | string | 附属设施情况 |
| `buildControlCondition` | string | 用地及建筑控制区情况 |
| `checkProblem` | string | 检查情况及遇到的问题 |
| `disposed` | string | 处置情况 |
| `stayDisposed` | string | 待处置情况 |
| `other` | string | 备注；页面可由关联记录的 `describes` 自动拼接 |
| `saveStatus` | string | `"1"` 暂存，`"2"` 正式提交 |
| `storageId` | string | 云南 PDF 流程使用；青海正常提交不生成该值 |

正式新增示例：

```json
{
  "checklogId": "",
  "title": "2026年7月26日巡查日志",
  "patrolType": "路巡",
  "startCheckTime": "2026-07-26 08:31:00",
  "endCheckTime": "2026-07-26 12:05:00",
  "weather": "1",
  "scheduleId": "<scheduleId>",
  "recordsIds": "<recordId1>,<recordId2>",
  "isUseCar": "1",
  "plateNumbers": "青A8A971",
  "lawEnforcementOfficials": "宁戎,杨富强",
  "lawEnforcementOfficialsIds": "<id1>,<id2>",
  "patrolRoute": "G6京藏高速公路西过境段",
  "schedulePersonnel": "<排班人员>",
  "schedulePersonnelId": "<排班人员 id>",
  "inspectionLength": "35.5",
  "roadCondition": "无异常情况",
  "roadProductCondition": "无异常情况",
  "buildControlCondition": "无异常情况",
  "checkProblem": "",
  "disposed": "",
  "stayDisposed": "",
  "other": "1. <关联现场记录描述>",
  "saveStatus": "2"
}
```

新增响应在暂存流程中被明确读取为：

```json
{
  "code": 200,
  "msg": "暂存成功",
  "data": {
    "checklogId": "<new checklogId>"
  }
}
```

正式提交页面不读取 `data`，但后端很可能仍返回同一 ID 结构。

### 4.6 更新 payload

```http
POST /check/checklog/updateCheChecklog
```

与新增字段相同，必须包含：

```json
{
  "checklogId": "<existing checklogId>",
  "oid": "<existing organId>"
}
```

正式修改使用 `saveStatus: "2"`。暂存按钮无论当前是新增还是已有日志，都调用 `updateCheChecklog`；当 `checklogId` 为空时，后端会创建暂存记录并返回新 `checklogId`。

### 4.7 删除

```http
GET /check/checklog/deleteCheChecklogById/{checklogId}
```

无业务 body。

### 4.8 日志同日查重

列表页提供的是 `createTime`（填报日期），不是巡查日期：

```http
GET /check/checklog/cheChecklogPageList
  ?createTime=2026-07-26
  &current=1
  &size=-1
```

建议对返回记录继续比较：

1. `scheduleId`
2. `recordsIds` 对应的关联记录集合
3. `plateNumbers`
4. 执法人员 ID 集合
5. `patrolRoute` 集合
6. `startCheckTime` / `endCheckTime`

再调用：

```http
GET /check/record/getCheRecordLog?checklogId=<candidate>
```

核对实际关联 `recordId`。

如果日志是次日补录，`createTime` 查询会漏掉目标记录。此时应扩大填报日期窗口，或查询候选列表后按 `startCheckTime` 的业务日期过滤。

## 5. 自动化提交顺序

推荐事务式顺序：

1. 查询当日排班，查重后新增或更新，保存 `scheduleId`。
2. 查询当日现场记录，按车辆、人员、路线和时间段查重。
3. 上传附件，保存每个 `storageId`。
4. 调用 `addCheRecord` 新增或更新现场记录。
5. 通过列表和 `cheRecordDetail` 回读，核对时间、路线、人员、描述和附件。
6. 调用 `addCheChecklog`，关联 `scheduleId` 和 `recordId`。
7. 通过 `cheChecklogPageList?checklogId=...` 和 `getCheRecordLog` 回读核对。

任何阶段失败时：

- 尚未进入现场记录的孤立附件可调用文件删除接口清理。
- 已创建的业务记录只有在明确记录本次创建 ID 且回读确认无人工修改后，才允许调用对应删除接口回滚。
- 不应通过“删除同日所有记录”清理。

## 6. 仍需浏览器抓包确认的项目

以下内容无法仅靠静态 bundle 完全证明：

1. `addCheRecord` 成功响应的 `data` 是否包含 `recordId`。页面只检查 `code`，未读取 `data`。
2. 正式 `addCheChecklog` 成功响应是否始终返回 `data.checklogId`。暂存流程明确返回，正式流程未读取。
3. `addCheSchedule` / `updateCheSchedule` 成功响应的 `data` 结构。页面只读取 `code` 和 `msg`。
4. JSON body 的最终线上 `Content-Type` 是否被网关、浏览器适配器或部署配置改写。静态 Axios 配置推导为 JSON 文本配 `application/x-www-form-urlencoded`。
5. 青海后端对正常记录中空 `listAbn` 与“含一个全空对象”的差异处理。
6. 新增现场记录时 `oid` 是否完全由登录会话补齐；官方新增页没有显式赋值。
7. 日志 `status` 的合法枚举和默认值。编辑页提交该字段，但新增表单没有设置明确默认值。
8. 服务端是否有未被当前页面使用的唯一约束或重复提交错误码。当前前端没有调用专门查重接口。

这些确认只需要在用户主动执行一次正常业务提交时观察 Network 请求和响应，不需要制造测试记录或调用删除接口。
