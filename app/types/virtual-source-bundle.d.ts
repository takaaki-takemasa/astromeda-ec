declare module 'virtual:source-bundle' {
  interface SourceFile {
    path: string;
    size: number;
    content: string;
  }

  interface SourceBundle {
    generatedAt: string;
    projectName: string;
    fileCount: number;
    files: SourceFile[];
  }

  const bundle: SourceBundle;
  export default bundle;
}
