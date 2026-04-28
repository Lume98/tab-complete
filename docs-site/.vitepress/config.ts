import { defineConfig } from "vitepress";

export default defineConfig({
  title: "AI Tab Complete",
  description: "AI 驱动的 VS Code 内联代码补全插件",
  lang: "zh-CN",
  base: "/tab-complete/",

  head: [
    ["link", { rel: "icon", href: "/favicon.ico" }],
  ],

  themeConfig: {
    logo: false,

    nav: [
      { text: "指南", link: "/guide/getting-started" },
      { text: "Provider 配置", link: "/providers/claude" },
      { text: "架构", link: "/architecture/overview" },
      {
        text: "v0.1.0",
        items: [
          { text: "更新日志", link: "/changelog" },
          { text: "GitHub", link: "https://github.com/Lume98/tab-complete" },
        ],
      },
    ],

    sidebar: {
      "/guide/": [
        {
          text: "使用指南",
          items: [
            { text: "快速开始", link: "/guide/getting-started" },
            { text: "安装", link: "/guide/installation" },
            { text: "配置", link: "/guide/configuration" },
            { text: "日常使用", link: "/guide/usage" },
          ],
        },
      ],
      "/providers/": [
        {
          text: "Provider 配置",
          items: [
            { text: "概览", link: "/providers/" },
            { text: "Claude (Anthropic)", link: "/providers/claude" },
            { text: "OpenAI", link: "/providers/openai" },
            { text: "Ollama (本地)", link: "/providers/ollama" },
          ],
        },
      ],
      "/architecture/": [
        {
          text: "架构设计",
          items: [
            { text: "架构概览", link: "/architecture/overview" },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: "github", link: "https://github.com/Lume98/tab-complete" },
    ],

    search: {
      provider: "local",
    },

    footer: {
      message: "MIT Licensed",
      copyright: "Copyright © 2024 AI Tab Complete",
    },

    outline: {
      level: [2, 3],
    },
  },
});
