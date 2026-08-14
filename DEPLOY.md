# 部署到 GitHub Pages（免费 HTTPS）

## 步骤

1. 在 GitHub 创建一个新仓库，比如叫 `workbench`

2. 把文件推上去：
```bash
cd /workspace/self-discipline-app
git init
git add .
git commit -m "自律工作台 v2"
git branch -M main
git remote add origin https://github.com/你的用户名/workbench.git
git push -u origin main
```

3. 在仓库设置开启 Pages：
   - Settings → Pages
   - Source: Deploy from a branch
   - Branch: main / root
   - 点 Save

4. 等待 1-2 分钟，访问 `https://你的用户名.github.io/workbench/`

5. iPhone 上用 **Safari** 打开这个网址
   - 点底部「分享」按钮（⬆️）
   - 选「添加到主屏幕」
   - 桌面出现图标，点开全屏运行！

## 注意

- 必须用 Safari（Chrome for iOS 不支持 PWA 安装）
- 必须 HTTPS（GitHub Pages 自动提供）
- 首次打开需联网，之后 Service Worker 缓存可离线使用
