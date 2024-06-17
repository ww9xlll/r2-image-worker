import { Hono } from 'hono/quick'
import { sha256 } from 'hono/utils/crypto'
import { basicAuth } from 'hono/basic-auth'
import { detectType, formatCurrentDate, getImageInfo, removeLeadingSlash } from './utils'

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

app.get('/', async (c) => {
  return c.html(`<html>

<head>
  <meta charset="UTF-8">
  <title>R2ImageWorker</title>
  <style>
    body {
      text-align: center;
      font-family: "PT Mono";
      font-style: italic;
      margin-top: 10px;
    }
  </style>
</head>
<h1 style="font-weight: lighter;">ww93's Image Worker</h1>

<body>
  Paste your image here.
  <p id="uploading"></p>
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
          const image_url = 'https://${c.req.header("host")}/' + data
          document.body.innerHTML += '<br>URL is: <a target="_blank" href="' + image_url + '">' + image_url + '</a>'
          document.body.innerHTML += '<hr><img style="max-width:500px" src="' + image_url + '" />'
          $("#uploading").text("")
        },
        error: function (data) {
          $("#uploading").text("Failed: " + data)
        }
      })

    }

    reader.readAsDataURL(blob);
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
  if (base64.startsWith('data')) {
    let result = getImageInfo(base64)
    mineType = result.format
    body = Uint8Array.from(atob(result.data), (c) => c.charCodeAt(0))
    key = formatCurrentDate() + (name ? name : (await sha256(body)))
  } else {
    const type = detectType(base64)
    if (!type) return c.body("invalid image type", 403)
    body = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    mineType = type.mimeType
    key = formatCurrentDate() + (name ? name : (await sha256(body))) + '.' + type.suffix
  }
  await c.env.BUCKET.put(key, body, { httpMetadata: { contentType: mineType } })
  return c.text(key)
})

app.get('**', async (c) => {
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
