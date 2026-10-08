require('@babel/register');
const assert = require('assert');
const rect = require('../../app/containers/HomePage/components/previewContentRect').default;
assert.deepStrictEqual(rect(520,1200,{width:1140,height:2616}), {x:0,y:3,width:520,height:1193});
assert.deepStrictEqual(rect(1200,520,{width:2616,height:1140}), {x:3,y:0,width:1193,height:520});
assert.deepStrictEqual(rect(1080,2400,{width:1080,height:2400}), {x:0,y:0,width:1080,height:2400});
assert.deepStrictEqual(rect(1088,1200,{width:1140,height:2616}), {x:0,y:0,width:1088,height:1200});
assert.deepStrictEqual(rect(520,1200,null), {x:0,y:0,width:520,height:1200});
console.log('Preview content: portrait/landscape alignment, exact ratio, stale fold dimensions and missing display passed.');
