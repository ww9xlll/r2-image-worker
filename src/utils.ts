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

export const formatCurrentDate = (): string => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  return `${year}/${month}/`;
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
