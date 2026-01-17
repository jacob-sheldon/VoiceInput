你是一名资深桌面应用工程师，精通 Electron、TypeScript、macOS 系统 API、
系统级快捷键、语音识别和 Native Module 开发。

请你直接为我【生成可运行代码】，实现一个 Typeless / TypePlus 风格的
macOS 桌面语音输入应用。

⚠️ 注意：这是一个工程生成任务，不是设计或产品介绍任务。

==================================================
【核心技术约束（非常重要）】

1. UI 框架：Electron
2. Electron 代码：TypeScript（不是 JavaScript）
3. 当前只实现 macOS 版本
4. 不使用 Swift / SwiftUI
5. 允许使用 macOS Native Module（C++ / Objective-C++）
6. 不做任何 LLM 文本润色（仅原始语音转写）
7. 生成的代码应当可以直接作为一个 Electron 项目运行

==================================================
【产品目标】

这是一个“系统级语音输入工具”：

- 用户在任意应用的文本输入框中
- 按下并按住【Command 键】开始说话
- 松开 Command 键后停止录音
- 语音被转写成文本
- 文本被【直接输入】到当前获得焦点的输入框中
- 不使用剪贴板

==================================================
【功能范围（MVP）】

### 1. Electron UI（TypeScript）
- Menu Bar App（不显示 Dock icon）
- 显示当前状态：
  - Idle
  - Listening
  - Transcribing
  - Typing
- UI 只负责展示状态和发 IPC 指令

### 2. 全局快捷键（重点）
- 监听 macOS 全局 Command 键
- 行为：
  - Command key down → 开始录音
  - Command key up → 停止录音并转写
- 不能影响原有 Command + 其他按键的系统行为

### 3. 语音识别（STT）
- 使用 whisper.cpp
- 本地运行
- 默认使用 small 模型
- 允许 tiny / small 切换
- 使用 chunk + overlap 的“准实时”方式
- 通过以下方式之一调用：
  - Node.js child_process
  - 或 Node Native Addon（任选其一即可）
- 返回最终转写文本（不需要 partial）·

### 4. macOS 文本注入（关键）
- 不使用剪贴板
- 使用 macOS Accessibility API / CGEvent
- 将转写文本直接输入到当前 focused input field
- 以 Native Module（Objective-C++ 或 C++）实现
- Electron 主进程通过 IPC 调用该模块

==================================================
【架构要求】

请采用清晰的分层结构：

- Electron UI（Renderer，TypeScript）
- Electron Main Process（TypeScript）
- Native Layer（macOS）
  - STT Engine（whisper.cpp）
  - Text Injection Module

UI 不得直接调用系统 API。

==================================================
【你必须输出的内容（不可省略）】

1. 完整项目目录结构
2. Electron 主进程（main.ts）
3. Renderer 进程最小 UI 示例（TypeScript）
4. Menu Bar App 的实现方式
5. Command 键监听的实现代码（macOS）
6. whisper.cpp 调用示例（可运行）
7. macOS 文本注入 Native Module 示例（Objective-C++）
8. IPC 通信示例（UI → Main → Native）
9. package.json / tsconfig.json
10. README（如何安装依赖并运行）

==================================================
【额外严格要求】

- 所有代码必须以“可运行”为目标
- 不要写伪代码
- 如果某部分只能简化实现，必须明确说明
- 不要输出产品介绍或原理解释
- 默认环境：
  - macOS 13+
  - Node.js 18+
- 直接开始生成项目代码