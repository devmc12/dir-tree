import api = require('@devmc12/dir-tree');
import node = require('@devmc12/dir-tree/node');
import tree = require('@devmc12/dir-tree/tree');
import parser = require('@devmc12/dir-tree/parser');
import adapters = require('@devmc12/dir-tree/adapters');

/**
 * Date: 2026-11-07
 * Desc: Checks CommonJS declarations without the DOM library
 */

const adapter: api.ReaderAdapter = new node.NodeFileSystemAdapter('.');
const warning: api.ReadWarning = {
  code: 'metadata_unavailable',
  operation: 'read_metadata',
  path: 'project/file',
  source: 'node',
};
const reader = new api.FileSystemReader(adapter);
const parsed: api.FileNode = parser.parseImportedTreeText(
  'project',
  'project'
).tree;
const prepared = tree.createPreparedFileTree(parsed);
const zip: api.ReaderAdapter = new adapters.ZipFileSystemAdapter(
  new Uint8Array()
);

void reader.read({
  onWarning: value => {
    const path: string = value.path;
    void path;
  },
});
void warning;
void zip;
api.getFileTreeMetadata(prepared);
