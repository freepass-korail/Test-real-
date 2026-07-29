import logoKtxSrc        from '../assets/ktx-logo.png';
import logoMugunghwaSrc  from '../assets/train-mugunghwa.png';
import logoItxSrc        from '../assets/train-itx.png';
import logoNuriroSrc     from '../assets/train-nuriro.png';
import logoItxCheongSrc  from '../assets/train-itx-cheongchun.png';
import logoItxSaemaulSrc from '../assets/train-itx-saemaul.png';

function preload(src) {
  const img = new Image();
  img.src = src;
  return src;
}

export const logoKtx        = preload(logoKtxSrc);
export const logoMugunghwa  = preload(logoMugunghwaSrc);
export const logoItx        = preload(logoItxSrc);
export const logoNuriro     = preload(logoNuriroSrc);
export const logoItxCheong  = preload(logoItxCheongSrc);
export const logoItxSaemaul = preload(logoItxSaemaulSrc);
