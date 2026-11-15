// 文件拖到终端以外的区域（侧栏、顶栏、引导页）时阻止浏览器默认的「打开该文件」，否则整个界面会被该文件替换；
// 终端容器自己处理拖入并转换为路径，不受影响。主进程另有 will-navigate 拦截兜底。
// 拖进输入框的文字仍按默认行为插入。

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');

export function installDropGuard(doc: Document = document): void {
  for (const type of ['dragover', 'drop'] as const) {
    doc.addEventListener(type, (e) => {
      if (e.dataTransfer?.types.includes('Files') || !isEditable(e.target)) e.preventDefault();
    });
  }
}
