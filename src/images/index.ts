import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';

type GetNextImageOptions = {
  lastImageName: string | undefined;
};

type NextImage = {
  imageName: string;
  absolutePath: string;
  loopedAround: boolean;
};

async function getNextImage(options?: GetNextImageOptions): Promise<NextImage> {
  const { lastImageName } = options || {};
  const readdir = util.promisify(fs.readdir);
  const imagesDir = path.resolve(__dirname, '../../imagequeue');
  const imageFiles = (await readdir(imagesDir)).sort();
  const imageRegex = /\.(jpg|jpeg|png|gif|bmp)$/i;
  const validImageFiles = imageFiles.filter((filename) => imageRegex.test(filename));

  if (validImageFiles.length === 0) {
    throw new Error('No image files found in the directory.');
  }

  let nextImageIndex = 0; // default value if no lastImageName provided, or it's not found
  let loopedAround = false;

  if (lastImageName) {
    const lastImageIndex = validImageFiles.indexOf(lastImageName);
    if (lastImageIndex >= 0) {
      nextImageIndex = lastImageIndex + 1;
      if (nextImageIndex >= validImageFiles.length) {
        nextImageIndex = 0; // loop back to the first image if we've reached the end
        loopedAround = true;
      }
    }
  }

  const imageName = validImageFiles[nextImageIndex];
  const absolutePath = path.join(imagesDir, imageName);

  return {
    imageName,
    absolutePath,
    loopedAround,
  };
}

export { getNextImage };
