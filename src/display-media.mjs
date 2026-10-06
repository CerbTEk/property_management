export const displayImageBucket='treestand-display-images';
export function imageExtension(file){const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];if(!ext)throw Error('Choose a JPG, PNG or WebP image.');if(!file.size||file.size>8*1024*1024)throw Error('Each image must be smaller than 8 MB.');return ext;}
export function nextImagePosition(images){for(let i=0;i<12;i++)if(!images.some(image=>image.position===i))return i;throw Error('This property already has 12 photos. Remove one before uploading another.');}
