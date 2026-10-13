/**
 * A small animated GLB for UI tests. Only the model response is replaced;
 * Three.js, controls, events, export and placement state still run normally.
 * @returns A valid GLB containing one triangle and a looping translation track.
 */
export function uiModel(): Buffer {
  const arrays = [
    new Float32Array([-1, 0, 0, 1, 0, 0, 0, 1, 0]),
    new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    new Float32Array([0, 1, 2]),
    new Float32Array([0, 0, 0, 0, 0.1, 0, 0, 0, 0]),
  ];
  let offset = 0;
  const bufferViews = arrays.map(array => {
    const view = { buffer: 0, byteOffset: offset, byteLength: array.byteLength };
    offset += array.byteLength;
    return view;
  });
  const document = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    buffers: [{ byteLength: offset }], bufferViews,
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-1, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: 3, type: 'SCALAR', min: [0], max: [2] },
      { bufferView: 3, componentType: 5126, count: 3, type: 'VEC3' },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.2, 0.6, 0.8, 1], metallicFactor: 0 } }],
    animations: [{ name: 'UI animation', samplers: [{ input: 2, output: 3 }], channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }] }],
  };
  const json = Buffer.from(JSON.stringify(document));
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20); json.copy(padded);
  const binary = Buffer.concat(arrays.map(array => Buffer.from(array.buffer)));
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + padded.length + binary.length, 8);
  header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const binaryHeader = Buffer.alloc(8);
  binaryHeader.writeUInt32LE(binary.length, 0); binaryHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, padded, binaryHeader, binary]);
}
