import { BskyAgent, stringifyLex, jsonToLex } from '@atproto/api';
import * as fs from 'fs';
import * as util from 'util';
import * as sharp from 'sharp';

const GET_TIMEOUT = 15e3; // 15s
const POST_TIMEOUT = 60e3; // 60s

const readFile = util.promisify(fs.readFile);

async function loadImageData(path: fs.PathLike) {
  // Read the file from the provided path
  let buffer = await readFile(path);

  // Check file size, 1MB = 1024*1024 bytes
  if (buffer.byteLength > 1024 * 1024) {
    buffer = await resizeImage(buffer);
  }

  // Convert the buffer to a Uint8Array and return it
  return { data: new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength) };
}

async function resizeImage(buffer: Buffer): Promise<Buffer> {
  let newSize = 0.9; // Start with 90% of original size
  let outputBuffer = buffer;
  const image = sharp(buffer);

  const metadata = await image.metadata();

  // We'll try to reduce the image size by 10% in each iteration until the image is under 1MB
  while (outputBuffer.byteLength > 976.56 * 1024) {
    const newWidth = Math.round(metadata.width * newSize);

    outputBuffer = await image
      .rotate() // Correct image rotation based on EXIF data
      .resize(newWidth)
      .jpeg()
      .toBuffer();

    newSize -= 0.1; // Decrease the target size by 10%
  }

  return outputBuffer;
}

interface FetchHandlerResponse {
  status: number;
  headers: Record<string, string>;
  body: ArrayBuffer | undefined;
}

async function fetchHandler(
  reqUri: string,
  reqMethod: string,
  reqHeaders: Record<string, string>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reqBody: any,
): Promise<FetchHandlerResponse> {
  const reqMimeType = reqHeaders['Content-Type'] || reqHeaders['content-type'];
  if (reqMimeType && reqMimeType.startsWith('application/json')) {
    reqBody = stringifyLex(reqBody);
  } else if (typeof reqBody === 'string' && (reqBody.startsWith('/') || reqBody.startsWith('file:'))) {
  }

  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), reqMethod === 'post' ? POST_TIMEOUT : GET_TIMEOUT);

  const res = await fetch(reqUri, {
    method: reqMethod,
    headers: reqHeaders,
    body: reqBody,
    signal: controller.signal,
  });

  const resStatus = res.status;
  const resHeaders: Record<string, string> = {};
  res.headers.forEach((value: string, key: string) => {
    resHeaders[key] = value;
  });
  const resMimeType = resHeaders['Content-Type'] || resHeaders['content-type'];
  let resBody;
  if (resMimeType) {
    if (resMimeType.startsWith('application/json')) {
      resBody = jsonToLex(await res.json());
    } else if (resMimeType.startsWith('text/')) {
      resBody = await res.text();
    } else {
      resBody = await res.blob();
    }
  }

  clearTimeout(to);

  return {
    status: resStatus,
    headers: resHeaders,
    body: resBody,
  };
}

type PostImageOptions = {
  path: fs.PathLike;
  text: string;
  altText: string;
};
async function postImage({ path, text, altText }: PostImageOptions) {
  const agent = new BskyAgent({ service: 'https://bsky.social' });
  BskyAgent.configure({
    fetch: fetchHandler,
  });
  await agent.login({
    identifier: process.env.BSKY_IDENTIFIER || 'BSKY_IDENTIFIER missing',
    password: process.env.BSKY_PASSWORD || 'BSKY_PASSWORD missing',
  });
  const { data } = await loadImageData(path);

  const testUpload = await agent.uploadBlob(data, { encoding: 'image/jpg' });
  await agent.post({
    text: text,
    embed: {
      images: [
        {
          image: testUpload.data.blob,
          alt: altText,
        },
      ],
      $type: 'app.bsky.embed.images',
    },
  });
}

export { postImage };
