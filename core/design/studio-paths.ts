/** Where a new page's design record lives; a leaf module so every studio module can name it without importing another. */
export const STUDIO_DIR = '.omd/studio';
/** The provenance of every image a new page adds; written only by omd studio asset and omd studio image. */
export const STUDIO_IMAGES = `${STUDIO_DIR}/images.json`;
