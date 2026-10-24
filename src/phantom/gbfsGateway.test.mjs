import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createGateway } from '../../server/gateway/index.js';
import { createBikeshareSource } from '../layers/bikeshare/source.js';

test('real bikeshare source request survives gateway route validation', async () => {
  let reached = false;
  const gateway = createGateway();
  const source = createBikeshareSource({fetchImpl: async (url) => {
    const response = new EventEmitter();
    let code = 200;
    response.writeHead = value => { code = value; };
    response.end = () => response.emit('finish');
    await gateway({url,method:'GET',headers:{},socket:{remoteAddress:'127.0.0.1'}},response,()=>{reached=true;response.emit('finish');});
    return {ok:code===200,status:code,json:async()=>({data:{stations:[]}})};
  }});
  await source.getStations('https://gbfs.lyft.com/gbfs/2.3/bkn/en/station_information.json');
  assert.equal(reached,true);
});
