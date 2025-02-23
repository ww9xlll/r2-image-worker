import { Hono } from 'hono/quick'
import { Context } from 'hono'
import { sha256 } from 'hono/utils/crypto'
import { basicAuth } from 'hono/basic-auth'
import { detectType, formatCurrentDate, formatFileName, getImageInfo, removeLeadingSlash } from './utils'
import { cors } from 'hono/cors'

type Bindings = {
  BUCKET: R2Bucket
  USER: string
  PASS: string
}

type Data = {
  body: string
  name?: string
  width?: string
  height?: string
}

const maxAge = 60 * 60 * 24 * 30

const app = new Hono<{ Bindings: Bindings }>()

app.get('/favicon.ico', async (c) => {
  return c.notFound()
})

// 应用 CORS 中间件
app.use('*', cors({
  origin: ['app://obsidian.md'],
  allowMethods: ['POST', 'GET', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
  credentials: true,
}))

app.get('/', async (c) => {
  return c.html(`<html>

<head>
    <meta charset="UTF-8">
    <title>image worker</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            text-align: center;
            font-family: "PT Mono";
            font-style: italic;
            margin-top: 10px;
            margin: 0;
            padding: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            background-color: #f4f4f4;
        }

        .image-container {
            align-items: center;
            justify-content: space-between;
            margin-bottom: 20px;
            display: none;
        }

        .image-url {
            flex-grow: 1;
            padding: 10px;
            border: 1px solid #ccc;
            border-radius: 5px;
            font-family: monospace;
            overflow-wrap: break-word;
        }

        .copy-button {
            background-color: #007bff;
            color: white;
            border: none;
            padding: 10px 15px;
            border-radius: 5px;
            cursor: pointer;
        }
    </style>
</head>

<body>
    <h1 style="font-weight: lighter;">image worker</h1>
    Paste your image here.
    <p id="uploading"></p>
    <div class="image-container">
        <br>
        <a class="image-url" id="image-url" target="_blank" href=""></a>
        <button class="copy-button" onclick="copyImageUrl()">Copy</button>
        <br>
        <img id="image" style="max-width:500px" src="" />
    </div>
</body>
<footer></footer>
<script src="//cdnjs.cloudflare.com/ajax/libs/jquery/3.6.1/jquery.min.js"></script>
<script>
    // window.addEventListener('paste', ... or
    document.onpaste = function (event) {
        var items = (event.clipboardData || event.originalEvent.clipboardData).items;
        var blob = items[0].getAsFile();
        var reader = new FileReader();
        reader.onload = function (event) {
            $("#uploading").text("Uploading...")
            $.ajax({
                url: '/upload',
                type: 'PUT',
                data: JSON.stringify({ name: blob.name, body: event.target.result }),
                success: function (data) {
                    const imageUrl = '${c.req.url}' + data
                    $('#image-url').text(imageUrl)
                    $('#image-url').attr('href', imageUrl)
                    $('#image').attr('src', imageUrl)
                    $('.image-container').css('display', 'block')
                    $("#uploading").text("")
                },
                error: function(jqXHR, textStatus, errorThrown) {
                    $("#uploading").text(textStatus + ":"+ jqXHR.status + ":" + errorThrown)
                }
            })

        }
        reader.readAsDataURL(blob);
    }
    function copyImageUrl() {
        const imageUrl = document.getElementById('image-url').innerText;
        // 创建一个临时的 textarea 元素来存储 URL 并执行复制操作
        const textarea = document.createElement('textarea');
        textarea.value = imageUrl;
        textarea.style.position = 'fixed';  // 确保它不会干扰页面布局
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    }
</script>

</html>`)
})

app.put('/upload', async (c, next) => {
  const auth = basicAuth({ username: c.env.USER, password: c.env.PASS })
  await auth(c, next)
})

app.put('/upload', async (c) => {
  const data = await c.req.json<Data>()
  const name = data.name
  const base64 = data.body
  if (!base64) return c.body("missing image body", 403)
  let mineType, key, body
  const today = new Date(new Date().getTime() + 8 * 60 * 60 * 1000)
  if (base64.startsWith('data')) {
    let result = getImageInfo(base64)
    mineType = result.format
    body = Uint8Array.from(atob(result.data), (c) => c.charCodeAt(0))
    key = formatCurrentDate(today) + (name ? formatFileName(name, today) : (await sha256(body)))
  } else {
    const type = detectType(base64)
    if (!type) return c.body("invalid image type", 403)
    body = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    mineType = type.mimeType
    key = formatCurrentDate(today) + (name ? name : (await sha256(body))) + '.' + type.suffix
  }
  await c.env.BUCKET.put(key, body, { httpMetadata: { contentType: mineType } })
  return c.text(key)
})

// 模拟的 token 验证函数
const validateToken = (c: Context, token: string): boolean => {
  const tokens = c.env.TOKENS as string
  const tokenArray = tokens.split(',').map((t: string) => t.trim())
  return tokenArray.includes(token)
}

// Auth 中间件
const authMiddleware = async (c: Context, next: () => Promise<void>) => {
  const authHeader = c.req.header('Authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized: No token provided' }, 401)
  }

  const token = authHeader.split(' ')[1]

  if (!validateToken(c, token)) {
    return c.json({ error: 'Unauthorized: Invalid token' }, 401)
  }

  await next()
}

app.post('/upload', authMiddleware, async (c) => {
  const body = await c.req.parseBody()
  const file = body['file'] as File
  if (!file) {
    return c.json({ error: 'No file uploaded' }, 400)
  }
  const type = file.type
  const today = new Date(new Date().getTime() + 8 * 60 * 60 * 1000)
  const key = formatCurrentDate(today) + file.name
  await c.env.BUCKET.put(key, file.stream(), { httpMetadata: { contentType: type } })

  return c.json({
    name: file.name,
    size: file.size,
    url: `https://image.ww93.fun/${key}`,
  })
})

app.get('**', async (c) => {
  // 可以在这里判断 user agent，比如是否包含 Obsidian 从而限制访问
  const key = removeLeadingSlash(c.req.path);
  const object = await c.env.BUCKET.get(key)
  if (!object) return c.body(key, 404)
  const data = await object.arrayBuffer()
  const contentType = object.httpMetadata?.contentType ?? ''
  return c.body(data, 200, {
    'Cache-Control': `public, max-age=${maxAge}`,
    'Content-Type': contentType
  })
})

export default app
