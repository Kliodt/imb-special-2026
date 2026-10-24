import zxingWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

const SCAN_INTERVAL_MS = 150;
const FORMATS = ['qr_code'];
const CAMERA = { video: { facingMode: { ideal: 'environment' } }, audio: false };

const Status = Object.freeze({
  REQUESTING: 'Разреши доступ к камере',
  AIMING: 'Наведи на QR-код у экспоната',
  FOREIGN: 'Это не код выставки',
  INSECURE: 'Камера в браузере работает только по HTTPS',
  DENIED: 'Доступ к камере запрещён в настройках браузера',
  NOT_FOUND: 'Камера не найдена',
  FAILED: 'Камера недоступна',
});

const errorStatus = { NotAllowedError: Status.DENIED, NotFoundError: Status.NOT_FOUND };

let detectorPromise = null;

/** Native BarcodeDetector where it reads QR (e.g. Chrome on Android), otherwise ZXing WebAssembly from our origin. */
async function createDetector() {
  const NativeDetector = globalThis.BarcodeDetector;
  if (NativeDetector && (await NativeDetector.getSupportedFormats()).includes('qr_code')) {
    return new NativeDetector({ formats: FORMATS });
  }
  const { BarcodeDetector, prepareZXingModule } = await import('barcode-detector/ponyfill');
  await prepareZXingModule({
    overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? zxingWasmUrl : prefix + path) },
    fireImmediately: true,
  });
  return new BarcodeDetector({ formats: FORMATS });
}

function getDetector() {
  detectorPromise ??= createDetector().catch(error => {
    detectorPromise = null;
    throw error;
  });
  return detectorPromise;
}

/** Camera viewfinder that lives inside the cover square. */
export class Scanner {
  #trigger;
  #viewfinder;
  #video;
  #status;
  #retry;
  #closeButton;
  #onCode;
  #stream = null;
  #timer = 0;
  #isOpen = false;
  // Bumped on every stop so that stale async camera starts and scan loops bail out.
  #session = 0;

  /** @param {{ onCode: (text: string) => boolean }} options onCode returns true when the code is accepted. */
  constructor({ trigger, viewfinder, video, status, retry, closeButton, onCode }) {
    this.#trigger = trigger;
    this.#viewfinder = viewfinder;
    this.#video = video;
    this.#status = status;
    this.#retry = retry;
    this.#closeButton = closeButton;
    this.#onCode = onCode;
    trigger.addEventListener('click', () => this.open());
    closeButton.addEventListener('click', () => this.close());
    retry.addEventListener('click', () => this.#startCamera());
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') this.close();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.close();
    });
  }

  open() {
    if (this.#isOpen) return;
    this.#isOpen = true;
    this.#viewfinder.hidden = false;
    this.#closeButton.focus();
    this.#startCamera();
  }

  close() {
    if (!this.#isOpen) return;
    this.#isOpen = false;
    const hadFocus = this.#viewfinder.contains(document.activeElement);
    this.#viewfinder.hidden = true;
    this.#stopCamera();
    if (hadFocus) this.#trigger.focus();
  }

  async #startCamera() {
    this.#stopCamera();
    const session = this.#session;
    this.#retry.hidden = true;
    this.#viewfinder.classList.remove('unavailable');
    this.#status.textContent = Status.REQUESTING;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.#fail(Status.INSECURE, false);
      return;
    }
    // Download the decoder while the permission prompt is open; a failure is reported when awaited below.
    getDetector().catch(() => {});
    try {
      const stream = await navigator.mediaDevices.getUserMedia(CAMERA);
      if (session !== this.#session) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      this.#stream = stream;
      this.#video.srcObject = stream;
      const [detector] = await Promise.all([getDetector(), this.#video.play()]);
      if (session !== this.#session) return;
      this.#status.textContent = Status.AIMING;
      this.#scan(detector, session);
    } catch (error) {
      if (session !== this.#session) return;
      this.#stopCamera();
      this.#fail(errorStatus[error.name] ?? Status.FAILED, true);
    }
  }

  #scan(detector, session) {
    const tick = async () => {
      // detect() rejects while the video has no frame yet; just try again on the next tick.
      const [code] = await detector.detect(this.#video).catch(() => []);
      if (session !== this.#session) return;
      if (code && this.#onCode(code.rawValue)) {
        this.close();
        return;
      }
      if (code) this.#status.textContent = Status.FOREIGN;
      this.#timer = setTimeout(tick, SCAN_INTERVAL_MS);
    };
    tick();
  }

  #stopCamera() {
    ++this.#session;
    clearTimeout(this.#timer);
    this.#stream?.getTracks().forEach(track => track.stop());
    this.#stream = null;
    this.#video.srcObject = null;
  }

  #fail(status, canRetry) {
    this.#status.textContent = status;
    this.#retry.hidden = !canRetry;
    this.#viewfinder.classList.add('unavailable');
  }
}
