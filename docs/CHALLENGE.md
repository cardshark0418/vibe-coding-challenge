# 视频片段标注平台（原始题目）

让多个团队的标注员在视频上标出时间段，管理员按天统计有效工作量。

我们的数据团队需要标注员从机器人示教视频里标出有用的片段。现在标注员把起止时间填进表格，管理员每天手工汇总，数字经常对不上。请做一个 Web 应用替代这套流程。

## 谁在用

管理员发布标注任务，查看工作量统计。标注员登录后领取任务，在视频上标出若干时间段，完成后提交。每个标注员属于一个租户，只能看到本租户的任务。

## 输入

- 管理员发布任务时指定的视频和租户
- 测试视频可以从 Hugging Face 上的公开机器人示教数据集下载：
  - [ALOHA 双臂做咖啡](https://huggingface.co/datasets/lerobot/aloha_static_coffee)，[直接下载一段视频](https://huggingface.co/datasets/lerobot/aloha_static_coffee/resolve/main/videos/observation.images.cam_high/chunk-000/file-000.mp4)（约 500 MB）
  - [Push-T 推方块](https://huggingface.co/datasets/lerobot/pusht)，[直接下载一段视频](https://huggingface.co/datasets/lerobot/pusht/resolve/main/videos/observation.image/chunk-000/file-000.mp4)（约 7 MB）

## 输出

- 每个已提交任务的时间段列表
- 管理员页面上每天的有效时长

## 规则

- 同一个任务里的时间段不能重叠。
- 有效时长是已提交任务中所有时间段长度之和，未提交的不计。
- 有效时长计入任务提交的那一天。
- 租户之间的数据隔离在后端完成。

## 提交内容

- 前后端代码和启动说明
- `report.md`：README 没写到的地方你是怎么决定的，怎么确认 AI 写的代码是对的，用到了哪些 rules 和 skills，还有哪些地方没做完或者不放心
- 技术栈不限，可以使用任何 AI 工具。标注员每天都要用这个界面，视觉和操作体验都会计分。
- 你的个人仓库链接
