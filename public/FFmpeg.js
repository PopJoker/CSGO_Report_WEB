// 建立壓縮 Modal
const compressModal = document.createElement('div');
compressModal.innerHTML = `
  <div class="bg-gray-800 p-6 rounded shadow-lg space-y-2 w-80 text-center">
    <p class="mb-2">影片正在壓縮，請稍候…</p>
    <progress id="compressProgress" value="0" max="100" class="w-full"></progress>
    <button id="confirmCompress" class="px-4 py-2 bg-blue-600 rounded mt-2 hidden">確認上傳壓縮後影片</button>
  </div>
`;
compressModal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center hidden';
document.body.appendChild(compressModal);

const compressProgress = compressModal.querySelector('#compressProgress');
const confirmCompress = compressModal.querySelector('#confirmCompress');

// 點擊壓縮
compressBtn.addEventListener('click', async () => {
    const file = evidenceInput.files[0];
    if (!file) return;

    compressModal.style.display = 'flex';
    compressProgress.value = 0;
    confirmCompress.style.display = 'none';

    const { createFFmpeg, fetchFile } = FFmpeg;
    const ffmpeg = createFFmpeg({
        log: true, progress: ({ ratio }) => {
            compressProgress.value = Math.round(ratio * 100);
        }
    });

    showMsg('載入壓縮模組中...', 'blue');
    await ffmpeg.load();
    showMsg('開始壓縮影片...', 'blue');

    ffmpeg.FS('writeFile', 'input.mp4', await fetchFile(file));

    // 壓縮影片 - 可調整 crf 控制畫質
    await ffmpeg.run('-i', 'input.mp4', '-vcodec', 'libx264', '-crf', '28', 'output.mp4');

    const data = ffmpeg.FS('readFile', 'output.mp4');
    compressedFile = new File([data.buffer], file.name, { type: 'video/mp4' });

    showMsg('影片壓縮完成', 'green');
    confirmCompress.style.display = 'inline-block';
});

// 確認壓縮後替換原始檔案
confirmCompress.addEventListener('click', () => {
    if (compressedFile) {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(compressedFile);
        evidenceInput.files = dataTransfer.files;
    }
    compressModal.style.display = 'none';
});
