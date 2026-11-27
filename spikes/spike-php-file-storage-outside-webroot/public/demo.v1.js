// Mostra a resposta de um pedido com Range ao stream.php (status, Content-Range e os bytes recebidos).
// O nome tem a versão (demo.v1.js): o Cloudflare guarda arquivos estáticos por 4 h, então uma mudança troca o nome.
const out = document.getElementById('range-out');

document.querySelectorAll('button[data-range]').forEach((button) => {
  button.addEventListener('click', async () => {
    const range = button.dataset.range;
    out.textContent = 'Pedindo…';
    try {
      const res = await fetch('stream.php?f=pdf', { headers: { Range: range }, cache: 'no-store' });
      const bytes = new Uint8Array(await res.arrayBuffer());
      const text = Array.from(bytes, (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '·')).join('');
      out.textContent = [
        `Range: ${range}`,
        `HTTP ${res.status}`,
        `Content-Range: ${res.headers.get('Content-Range') ?? '(nenhum)'}`,
        `Recebidos: ${bytes.length} bytes`,
        text ? `Conteúdo: ${text}` : '',
      ].filter(Boolean).join('\n');
    } catch (error) {
      out.textContent = `Falhou: ${error}`;
    }
  });
});
