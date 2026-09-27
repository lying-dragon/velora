import {writeFileSync} from 'node:fs';
import {activityTcx} from '../src/activity';
const startedAt=Date.now()-120000;
writeFileSync('docs/strava-ui-check.tcx',activityTcx({id:'velora-ui-check',startedAt,duration:60,distance:300,energy:6,ascent:0,ftp:200,source:'demo',workout:'[TEST] VELORA upload check - synthetic',route:'No real route',samples:Array.from({length:61},(_,seconds)=>({seconds,watts:100,cadence:80,heartRate:null,distance:seconds*5,speed:18}))}));
