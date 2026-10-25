import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS,normalizeSettings,actionForFileName,formatAttachmentRequest} from '../dist/core.mjs';
const imagesOnly={...DEFAULT_SETTINGS,embedExtensions:'png jpg jpeg gif webp svg avif bmp',unlistedAction:'link'};
test('images-only policy covers audio, video, unknown and extensionless files without changing defaults',()=>{
 for(const name of ['report.pdf','sheet.xlsx','voice.mp3','clip.mp4','source.xyz','LICENSE'])assert.equal(actionForFileName(name,imagesOnly),'link');
 assert.equal(actionForFileName('Photo.PNG',imagesOnly),'embed');
 assert.equal(actionForFileName('clip.mp4',DEFAULT_SETTINGS),'embed');
 assert.equal(actionForFileName('source.xyz',DEFAULT_SETTINGS),'default');
 assert.equal(normalizeSettings({unlistedAction:'bad'}).unlistedAction,'default');
});
test('synchronous request respects settings and native Wiki/Markdown syntax',()=>{
 for(const [name,link,expected] of [['report.pdf','![[report.pdf]]','[[report.pdf]]'],['Photo.PNG','[[Photo.PNG]]','![[Photo.PNG]]'],['clip.mp4','![clip](clip.mp4)','[clip](clip.mp4)'],['Photo.PNG','[photo](Photo.PNG)','![photo](Photo.PNG)']]){
  const request={version:1,fileName:name,link,handled:false};
  assert.equal(formatAttachmentRequest(request,imagesOnly),true);assert.equal(request.link,expected);assert.equal(request.handled,true);
 }
});
test('invalid, already handled and unsupported requests are untouched',()=>{
 for(const value of [null,{}, {version:2,fileName:'a.pdf',link:'![[a.pdf]]',handled:false},{version:1,fileName:'a.pdf',link:'![[a.pdf]]',handled:true},{version:1,fileName:4,link:'x',handled:false}])assert.equal(formatAttachmentRequest(value,imagesOnly),false);
});
