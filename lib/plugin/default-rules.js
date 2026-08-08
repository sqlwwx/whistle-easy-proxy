/**
 * 默认拦截规则配置
 *
 * 结构: { hostPattern: { pathPattern: { action1: value1, ... } } }
 *
 * 支持的 host 匹配方式:
 *   - 精确匹配:  "github.com"
 *   - 通配符:    "*.githubusercontent.com" / "*steamcommunity.com"
 *   - 正则表达式: "^.*\\.google\\.com(\\.\\w+)?$"
 *
 * 支持的 path 匹配方式:
 *   - 全匹配:    "*" 或 ".*"
 *   - 精确路径:  "/fluidicon.png"
 *   - 正则表达式: "^(/[^/]+){2,}/?(\\?.*)?$"
 *
 * 支持的动作 (action):
 *   sni               — SNI 改写值 (如 "baidu.com"；"none" 表示不改写)
 *   proxy             — 代理到的目标主机
 *   backup            — 备用代理主机列表
 *   proxy_backup      — 备用代理 (支持 ${capture} 模板变量)
 *   cacheDays         — 缓存天数
 *   responseReplace   — 响应替换 { headers: {...}, doDownload: true }
 *   requestReplace    — 请求替换 { headers: {...}, doDownload: true }
 *   success           — 直接返回成功 (true 或 { script: "..." })
 *   abort             — 中断请求 (true/false)
 *   redirect          — 重定向 URL
 *   status            — HTTP 状态码
 *   tampermonkeyScript — 油猴脚本注入 URL
 *   script            — 脚本注入 URL
 *   options           — 标记 OPTIONS 请求
 *   desc              — 描述 (仅文档用途)
 *   remark            — 备注 (仅文档用途)
 *   test              — 测试 URL (仅文档用途)
 */

module.exports = {
  // ===== GitHub =====
  'github.com': {
    '^(/[^/]+){2,}/?(\\?.*)?$': {
      tampermonkeyScript:
        'https://raw.giteeusercontent.com/wangliang181230/dev-sidecar-config/raw/main/tampermonkey.js',
      script:
        'https://raw.giteeusercontent.com/wangliang181230/dev-sidecar-config/raw/main/GithubEnhanced-High-Speed-Download.user.js',
      remark: '注：上面所使用的脚本地址，为高速镜像地址。',
      desc: '油猴脚本：高速下载 Git Clone/SSH、Release、Raw、Code(ZIP) 等文件 (公益加速)、项目列表单文件快捷下载、添加 git clone 命令',
    },
    '^((/[^/]+){2,})/raw((/[^/]+)+\\.(jpg|jpeg|png|gif))(\\?.*)?$': {
      cacheDays: 365,
      desc: '仓库内图片重定向，缓存1年。',
    },
    '^((/[^/]+){2,})/raw((/[^/]+)+\\.js)(\\?.*)?$': {
      responseReplace: {
        headers: {
          'content-type': 'application/javascript; charset=utf-8',
        },
      },
      desc: '仓库内脚本，设置响应头Content-Type。作用：方便script拦截器直接使用，避免引起跨域问题和脚本内容限制问题。',
    },
    '.*': {
      sni: 'baidu.com',
    },
    '/fluidicon.png': {
      cacheDays: 365,
      desc: 'Github那只猫的图片，缓存1年',
    },
    '^(/[^/]+){2}/pull/\\d+/open_with_menu.*$': {
      cacheDays: 7,
      desc: 'PR详情页：标题右边那个Code按钮的HTML代码请求地址，感觉上应该可以缓存。暂时先设置为缓存7天',
    },
  },

  'api.github.com': {
    '.*': {
      sni: 'baidu.com',
    },
    '^/_private/browser/stats$': {
      success: true,
      desc: 'github的访问速度分析上传，没有必要，直接返回成功',
    },
  },

  'github.githubassets.com': {
    '/assets/fakefile.js': {
      success: {
        script: ';',
      },
      cacheDays: 365,
    },
    '^(/[^/]+)*/[^./]+\\.(svg|png|gif|jpg|jpeg|ico|js|css)(\\?.*)?$': {
      cacheDays: 365,
      desc: '图片、JS文件、CSS文件，缓存1年',
    },
    '.*.backup': {
      desc: 'github.com域名下，该请求已经不存在，此配置暂时先备份掉。',
      proxy: 'github.com',
      sni: 'baidu.com',
      responseReplace: {
        headers: {
          'access-control-allow-origin': '*',
          'cross-origin-resource-policy': 'cross-origin',
          'set-cookie': '[remove]',
        },
      },
    },
    '.*': {
      sni: 'baidu.com',
    },
  },

  'opengraph.githubassets.com': {
    '^/(([^/]+/){3}issues/\\d+)?(\\?.*)?$': {
      cacheDays: 365,
    },
    '.*': {
      sni: 'baidu.com',
    },
  },

  '*.githubusercontent.com': {
    '.*': {
      sni: 'baidu.com',
      requestReplace: {
        headers: {
          'accept-language': 'en-US,en;q=0.8',
        },
      },
    },
  },

  'collector.github.com': {
    '/github/collect': {
      success: true,
      status: 204,
      desc: '采集数据，快速成功',
    },
    '.*': {
      sni: 'baidu.com',
    },
  },

  'gist.github.com': {
    '.*': {
      sni: 'baidu.com',
    },
  },

  '*.github.io': {
    '.*': {
      sni: 'baidu.com',
    },
  },

  '*.gravatar.com': {
    '.*': {
      sni: 'baidu.com',
    },
  },

  '*.windows.net': {
    '.*': {
      sni: 'baidu.com',
    },
  },

  // ===== Google Fonts =====
  'fonts.googleapis.com': {
    '.*': {
      proxy: 'fonts.googleapis.cn',
      backup: ['gstatic.loli.net', 'fonts-gstatic.proxy.ustclug.org'],
      test: 'https://fonts.googleapis.com/css?family=Oswald',
    },
  },

  'fonts.gstatic.com': {
    '.*': {
      proxy: 'fonts.gstatic.cn',
      backup: ['gstatic.loli.net', 'fonts-gstatic.proxy.ustclug.org'],
      test: 'https://fonts.gstatic.com/s/pacifico/v12/FwZY7-Qmy14u9lezJ-6H6MmBp0u-.woff2',
    },
  },

  '*.googleapis.com': {
    '.*': {
      sni: 'www.google.cn',
    },
  },

  'ajax.googleapis.com': {
    '.*': {
      proxy: 'ajax.proxy.ustclug.org',
      desc: '根据2026年4月24日时访问https://mirrors.ustc.edu.cn 的说明，修正internal v202604122348中指向ajax.lug.ustc.edu.cn的配置',
      backup: ['gapis.geekzu.org'],
      test: 'ajax.googleapis.com/ajax/libs/jquery/1.12.4/jquery.min.js',
    },
  },

  'kubernetes-charts.storage.googleapis.com': {
    '.*': {
      proxy: 'kubernetes-charts.proxy.ustclug.org',
    },
  },

  '^(?!.*(translate-pa).google(?:apis|usercontent)?.com).*google(?:apis|usercontent)?.com$': {
    '.*': {
      sni: 'www.google.cn',
      desc: '部分需要走其它代理的服务',
    },
  },

  // ===== Google 系 =====
  '^.*\\.(youtube\\.com|gstatic\\.com|youtube\\.nocookie\\.com|youtu\\.be|ggpht\\.com|i\\.ytimg\\.com|blogger\\.com|doodles\\.google|about\\.google|android\\.com)$':
    {
      '.*': {
        sni: 'baidu.com',
      },
    },

  '^.*\\.google\\.com(\\.\\w+)?$': {
    '.*': {
      sni: 'www.google.cn',
    },
  },

  '^(?<pre>.*).googlevideo.com$': {
    '*': {
      proxy_backup: '${pre}.gvt1.com',
      sni: 'g.cn',
      options: true,
    },
    '/generate_204': {
      success: true,
    },
  },

  'www.gstatic.com': {
    '/recaptcha/.*': {
      proxy: 'www.recaptcha.net',
    },
  },

  'www.google.com': {
    '/recaptcha/.*': {
      proxy: 'www.recaptcha.net',
    },
  },

  'themes.googleapis.com': {
    '.*': {
      proxy: 'themes.loli.net',
      backup: ['themes.proxy.ustclug.org'],
    },
  },

  'themes.googleusercontent.com': {
    '.*': {
      proxy: 'google-themes.proxy.ustclug.org',
    },
  },

  'clients*.google.com': {
    '.*': {
      abort: false,
      desc: '设置abort：true可以快速失败，节省时间',
    },
  },

  'www.googleapis.com': {
    '.*': {
      abort: false,
      desc: '设置abort：true可以快速失败，节省时间',
    },
  },

  'lh*.googleusercontent.com': {
    '.*': {
      abort: false,
      desc: '设置abort：true可以快速失败，节省时间',
    },
  },

  // ===== Microsoft / Docker =====
  'ms-sso.copilot.microsoft.com': {
    '.*': {
      sni: 'microsoft.com',
    },
  },

  'www.docker.com': {
    '.*': {
      sni: 'www.docker.com',
    },
  },

  'login.docker.com': {
    '.*': {
      sni: 'login.docker.com',
    },
    '/favicon.ico': {
      proxy: 'hub.docker.com',
      sni: 'baidu.com',
      desc: '登录页面的ico，采用hub.docker.com的',
    },
  },

  'download.docker.com': {
    '.*': {
      sni: 'download.docker.com',
    },
  },

  'hub.docker.com': {
    '.*': {
      sni: 'none',
    },
  },

  '*.docker.com': {
    '.*': {
      sni: 'www.docker.com',
    },
  },

  // ===== Pixiv =====
  '*.pixiv.net': {
    '.*': {
      sni: 'baidu.com',
    },
  },

  '*.pixiv.org': {
    '.*': {
      sni: 'baidu.com',
    },
  },

  '*.pximg.net': {
    '.*': {
      sni: 'baidu.com',
    },
  },

  '*.ads-pixiv.net': {
    '.*': {
      sni: 'baidu.com',
    },
  },

  '*.nikke-global.com': {
    '.*': {
      sni: 'baidu.com',
    },
  },

  'i.pximg.net': {
    '.*': {
      cacheDays: 365,
      requestReplace: {
        headers: {
          referer: 'https://www.pixiv.net/',
        },
        desc: "篡改请求头'Referer'，使Pixiv图片链接可以单独在浏览器打开",
      },
    },
  },

  // ===== YouTube =====
  '*.youtube.com': {
    '.*': {
      sni: 'baidu.com',
    },
  },

  '*.youtu.be': {
    '.*': {
      sni: 'baidu.com',
    },
  },

  '*.youtube-nocookie.com': {
    '.*': {
      sni: 'baidu.com',
    },
  },

  '*.ggpht.com': {
    '.*': {
      sni: 'baidu.com',
    },
  },

  'i.ytimg.com': {
    '.*': {
      sni: 'baidu.com',
    },
  },

  // ===== CDN / 镜像 =====
  'cdn.jsdelivr.net': {
    '^/.*\\.(js|css|png|jpg|jpeg|gif|json)(\\?.*)?$': {
      proxy: 'fastly.jsdelivr.net',
      backup: ['gcore.jsdelivr.net'],
    },
  },

  '*.greasyfork.org': {
    '.*': {
      sni: 'baidu.com',
    },
  },

  '*.cn-greasyfork.org': {
    '.*': {
      sni: 'baidu.com',
    },
  },

  '*.huggingface.co': {
    '.*': {
      sni: 'huggingface.cn',
    },
  },

  'cn.vuejs.org': {
    '.*': {
      sni: 'vuejs.org',
    },
  },

  '*z-library.sk': {
    '.*': {
      sni: 'www.baidu.com',
    },
  },

  '*z-lib.help': {
    '.*': {
      sni: 'www.baidu.com',
    },
  },

  // ===== Steam =====
  '*.steamserver.net': {
    '.*': {
      sni: 'www.baidu.com',
      desc: 'steam登录不稳定？无法复现先这么写',
    },
  },

  'images.steamusercontent.com': {
    '.*': {
      sni: 'baidu.com',
    },
  },

  '*steamcommunity.com': {
    '^(?!/discussions|/Profile|/app.*/discussions).*$': {
      sni: 'www.baidu.com',
      desc: '讨论区锁区,考虑不拦截丢给彩蛋',
    },
  },

  '^(?!.*cloudflare).*steamstatic.com$': {
    '.*': {
      sni: 'baidu.com',
      desc: 'steam社区数据不能也不需调整sni,直接直连',
    },
  },

  '*.steampowered.com': {
    '.*': {
      sni: 'www.baidu.com',
    },
  },

  // ===== 其他 =====
  'external-content.duckduckgo.com': {
    '.*': {
      sni: 'www.baidu.com',
    },
  },

  '*duckduckgo.com': {
    '.*': {
      sni: 'www.baidu.com',
    },
  },

  '*onedrive.live.com': {
    '.*': {
      sni: 'www.baidu.com',
    },
  },

  '*dropbox.com': {
    '.*': {
      sni: 'www.baidu.com',
    },
  },

  '*f-droid.org': {
    '.*': {
      sni: 'www.baidu.com',
    },
  },

  'fdroid.org': {
    '.*': {
      sni: 'www.baidu.com',
    },
  },

  '*apkmirror.com': {
    '.*': {
      sni: 'none',
    },
  },

  'jsd.proxy.aks.moe': {
    '^.*\\?DS_DOWNLOAD$': {
      requestReplace: { doDownload: true },
      responseReplace: { doDownload: true },
    },
  },

  'fastly.jsdelivr.net': {
    '^.*\\?DS_DOWNLOAD$': {
      requestReplace: { doDownload: true },
      responseReplace: { doDownload: true },
    },
  },

  'jsdelivr.pai233.top': {
    '^.*\\?DS_DOWNLOAD$': {
      requestReplace: { doDownload: true },
      responseReplace: { doDownload: true },
    },
  },

  'raw.incept.pw': {
    '^.*\\?DS_DOWNLOAD$': {
      requestReplace: { doDownload: true },
      responseReplace: { doDownload: true },
    },
  },

  'packages.elastic.co': {
    '.*': {
      proxy: 'elastic.proxy.ustclug.org',
    },
  },

  'ppa.launchpad.net': {
    '.*': {
      proxy: 'launchpad.proxy.ustclug.org',
    },
  },

  'downloads.openwrt.org': {
    '.*': {
      proxy: 'openwrt.proxy.ustclug.org',
    },
  },

  'registry.npmjs.org': {
    '.*': {
      desc: '既然ds有NPM镜像了，这个就没什么必要了，先不配置了',
    },
  },

  'repo1.maven.org': {
    '.*': {
      proxy: 'maven.proxy.ustclug.org',
    },
  },

  '*.msecnd.net': {
    '.*': {
      sni: 'baidu.com',
    },
  },

  '*.instagram.com': {
    '.*': {
      sni: 'g.cn',
    },
  },

  '*.cdninstagram.com': {
    '.*': {
      sni: 'g.cn',
    },
  },

  '*.intercom.io': {
    '.*': {
      sni: 'g.cn',
    },
  },

  '*startpage.com': {
    '.*': {
      sni: 'www.baidu.com',
    },
  },

  '*.brave.com': {
    '.*': {
      sni: 'www.baidu.com',
    },
  },

  // ===== GitHub 子域名 =====
  'camo.githubusercontent.com': {
    '^[a-zA-Z0-9/]+(\\?.*)?$': {
      cacheDays: 365,
      desc: '图片，缓存1年',
    },
  },

  'customer-stories-feed.github.com': {
    '.*': {
      proxy: 'customer-stories-feed.fastgit.org',
    },
  },

  'user-images.githubusercontent.com': {
    '^/.*\\.png(\\?.*)?$': {
      cacheDays: 365,
      desc: '用户在PR或issue等内容中上传的图片，缓存1年。注：每张图片都有唯一的ID，不会重复，可以安心缓存',
    },
  },

  'private-user-images.githubusercontent.com': {
    '^/.*\\.png(\\?.*)?$': {
      cacheDays: 30,
      desc: '用户在PR或issue等内容中上传的图片，缓存30天',
    },
  },

  'avatars.githubusercontent.com': {
    '^/u/\\d+(\\?.*)?$': {
      cacheDays: 365,
      desc: '用户头像，缓存1年',
    },
  },

  // ===== AWS / SQLite =====
  '*.s3.1amazonaws1.com': {
    '/sqlite3/.*': {
      redirect: 'npm.taobao.org/mirrors',
    },
  },

  // ===== 广告拦截 =====
  '*.carbonads.com': {
    '/carbon.*': {
      abort: true,
      desc: '广告拦截',
    },
  },

  '*.buysellads.com': {
    '/ads/.*': {
      abort: true,
      desc: '广告拦截',
    },
  },
};
