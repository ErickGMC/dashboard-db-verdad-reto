const errStr = '{"error":{"code":429,"message":"You exceeded your current quota"}}';
console.log(errStr.includes('429'));
