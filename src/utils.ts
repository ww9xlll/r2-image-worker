export type Type = {
  mimeType: string
  suffix: string
}

const signatures: Record<string, Type> = {
  R0lGODdh: { mimeType: 'image/gif', suffix: 'gif' },
  R0lGODlh: { mimeType: 'image/gif', suffix: 'gif' },
  iVBORw0KGgo: { mimeType: 'image/png', suffix: 'png' },
  '/9j/': { mimeType: 'image/jpg', suffix: 'jpg' },
  'UklGRg==': { mimeType: 'image/webp', suffix: 'webp' }
}

export const detectType = (b64: string): Type | undefined => {
  for (const s in signatures) {
    if (b64.indexOf(s) === 0) {
      return signatures[s]
    }
  }
}

export const formatCurrentDate = (today: Date): string => {
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}/`;
}

export const formatFileName = (fileName: string, now: Date): string => {
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const milliseconds = String(now.getMilliseconds()).padStart(3, '0');

  // 格式化时间戳
  const timestamp = `${hours}${minutes}${seconds}${milliseconds}`;

  // 查找文件后缀
  const lastDotIndex = fileName.lastIndexOf('.');
  if (lastDotIndex === -1) {
    // 如果没有文件后缀，直接添加时间戳
    return `${fileName}_${timestamp}`;
  }

  // 分割文件名和文件后缀
  const name = fileName.substring(0, lastDotIndex);
  const extension = fileName.substring(lastDotIndex);

  // 生成新的文件名
  return `${name}_${timestamp}${extension}`;
}

export function getImageInfo(b64: string) {
  const base64Parts = b64.split(',');
  const format = base64Parts[0].split(';')[0].split(':')[1];
  const data = base64Parts[1];
  return { format, data };
}

export const removeLeadingSlash = (str: string): string => {
  if (str.startsWith('/')) {
    return str.substring(1);
  }
  return str;
}
