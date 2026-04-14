// Quick AgentBus test — runs with Node ESM
import {AgentBus} from '../agent-bus.js';

let passed = 0;
let failed = 0;

function assert(name, condition) {
  if (condition) { console.log(`  ✓ ${name}`); passed++; }
  else { console.log(`  ✗ ${name}`); failed++; }
}

async function run() {
  // Test 1: Priority sort
  {
    const bus = new AgentBus();
    const order = [];
    bus.subscribe('test', () => order.push('low'), undefined, {priority: 'low'});
    bus.subscribe('test', () => order.push('critical'), undefined, {priority: 'critical'});
    bus.subscribe('test', () => order.push('normal'), undefined, {priority: 'normal'});
    bus.publish({type: 'test', payload: {}});
    await new Promise(r => setTimeout(r, 100));
    assert('Priority: critical first', order[0] === 'critical');
    assert('Priority: normal second', order[1] === 'normal');
    assert('Priority: low third', order[2] === 'low');
  }

  // Test 2: Target filter
  {
    const bus = new AgentBus();
    const received = [];
    bus.subscribe('msg', () => received.push('a'), undefined, {agentId: 'agent-a'});
    bus.subscribe('msg', () => received.push('b'), undefined, {agentId: 'agent-b'});
    bus.publish({type: 'msg', payload: {}, target: 'agent-a'});
    await new Promise(r => setTimeout(r, 100));
    assert('Target: only agent-a receives', received.length === 1 && received[0] === 'a');
  }

  // Test 3: Global monitor + target
  {
    const bus = new AgentBus();
    const r = [];
    bus.subscribe('*', () => r.push('monitor'));
    bus.subscribe('msg', () => r.push('targeted'), undefined, {agentId: 'agent-x'});
    bus.publish({type: 'msg', payload: {}, target: 'agent-x'});
    await new Promise(r => setTimeout(r, 100));
    assert('Monitor receives targeted event', r.includes('monitor'));
    assert('Targeted agent receives event', r.includes('targeted'));
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
