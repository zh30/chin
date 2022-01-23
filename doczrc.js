// eslint-disable-next-line import/no-anonymous-default-export
export default {
  files: [
    "./src/components/**/*.{md,markdown,mdx}",
    "./src/*.{md,markdown,mdx}"
  ],
  dest: "docsite", // 打包 docz 文档到哪个文件夹下
  title: "Chin UI", // 设置文档的标题
  typescript: true, // 支持 typescript 语法
  // themesDir: "theme", // 主题样式放在哪个文件夹下，后面会讲
  menu: ["GettingStarted", "Components"] // 生成文档的左侧菜单分类
};
