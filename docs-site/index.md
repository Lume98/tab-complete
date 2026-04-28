---
layout: home

hero:
  name: AI Tab Complete
  text: AI 驱动的 VS Code 内联补全
  tagline: 支持 Claude / OpenAI / Ollama，流式输出，即写即补
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/getting-started
    - theme: alt
      text: 配置指南
      link: /guide/configuration

features:
  - icon: 🧠
    title: 多 Provider 支持
    details: 支持 Claude (Anthropic)、OpenAI、Ollama 本地模型，配置文件一键切换，无需重启
  - icon: ⚡
    title: 流式输出
    details: 逐 token 推送补全结果，首 token 延迟 < 300ms，打字即出建议
  - icon: 🎯
    title: 智能上下文
    details: 自动收集光标前后代码，识别 20+ 编程语言，精准定位补全位置
  - icon: 🔒
    title: 本地优先
    details: API Key 支持配置文件、环境变量两种方式，不上报任何数据，可离线使用 Ollama
  - icon: ⚙️
    title: 灵活配置
    details: 12 项可配置参数，配置文件 > 环境变量 > VS Code 设置三级优先级
  - icon: 📦
    title: 双端缓存
    details: ClientCache + LruCache 两级缓存架构，命中率 > 60%，避免重复请求
---
