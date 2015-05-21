// transpile:mocha

import { BaseDriver } from '../..';
import { server } from 'appium-express';
import { routeConfiguringFunction } from 'mobile-json-wire-protocol';
import request from 'request-promise';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import 'mochawait';
import B from 'bluebird';

const should = chai.should();
chai.use(chaiAsPromised);

describe('BaseDriver', () => {

  let d;

  beforeEach(() => {
    d = new BaseDriver();
  });

  it('should return a sessionId from createSession', async () => {
    let [sessId] = await d.createSession({});
    should.exist(sessId);
    sessId.should.be.a('string');
    sessId.length.should.be.above(5);
  });

  it('should not be able to start two sessions without closing the first', async () => {
    await d.createSession({});
    await d.createSession({}).should.eventually.be.rejectedWith('session');
  });

  it('should be able to delete a session', async () => {
    let sessionId1 = await d.createSession({});
    await d.deleteSession();
    should.equal(d.sessionId, null);
    let sessionId2 = await d.createSession({});
    sessionId1.should.not.eql(sessionId2);
  });

  it('should get the current session', async () => {
    let [,caps] = await d.createSession({});
    caps.should.equal(await d.getSession());
  });

  it('should return sessions if no session exists', async () => {
    let sessions = await d.getSessions();
    sessions.length.should.equal(0);
  });

  it('should return sessions', async () => {
    await d.createSession({a: 'cap'});
    let sessions = await d.getSessions();

    sessions.length.should.equal(1);
    sessions[0].should.eql({
      id: d.sessionId,
      capabilities: {a: 'cap'}
    });
  });

  it.skip('should emit an unexpected end session event', async () => {
  });

  it('should error if commanded after shutdown', async () => {
    await d.createSession({});

    d.deleteSession = async function () {
      await B.delay(30);
      await this.deleteSession();
    }.bind(d);

    let del = d.execute('deleteSession');
    let url = d.execute('getSession');

    B.join([del, url]);

    url.should.eventually.be.rejectedWith('session');
  });

  describe('command queue', () => {
    let d = new BaseDriver();
    let waitMs = 10;
    d.getStatus = async () => {
      await B.delay(waitMs);
      return Date.now();
    }.bind(d);

    d.getSessions = async () => {
      await B.delay(waitMs);
      throw new Error("multipass");
    }.bind(d);

    it('should queue commands and execute/respond in the order received', async () => {
      let numCmds = 10;
      let cmds = [];
      for (let i = 0; i < numCmds; i++) {
        cmds.push(d.execute('getStatus'));
      }
      let results = await B.all(cmds);
      for (let i = 1; i < numCmds; i++) {
        if (results[i] <= results[i - 1]) {
          throw new Error("Got result out of order");
        }
      }
    });

    it('should handle errors correctly when queuing', async () => {
      let numCmds = 10;
      let cmds = [];
      for (let i = 0; i < numCmds; i++) {
        if (i === 5) {
          cmds.push(d.execute('getSessions'));
        } else {
          cmds.push(d.execute('getStatus'));
        }
      }
      let results = await B.settle(cmds);
      for (let i = 1; i < 5; i++) {
        if (results[i].value() <= results[i - 1].value()) {
          throw new Error("Got result out of order");
        }
      }
      results[5].reason().message.should.contain("multipass");
      for (let i = 7; i < numCmds; i++) {
        if (results[i].value() <= results[i - 1].value()) {
          throw new Error("Got result out of order");
        }
      }
    });

    it('should not care if queue empties for a bit', async () => {
      let numCmds = 10;
      let cmds = [];
      for (let i = 0; i < numCmds; i++) {
        cmds.push(d.execute('getStatus'));
      }
      let results = await B.all(cmds);
      cmds = [];
      for (let i = 0; i < numCmds; i++) {
        cmds.push(d.execute('getStatus'));
      }
      results = await B.all(cmds);
      for (let i = 1; i < numCmds; i++) {
        if (results[i] <= results[i - 1]) {
          throw new Error("Got result out of order");
        }
      }
    });

  });

});

describe('BaseDriver via HTTP', () => {
  let baseServer, d = new BaseDriver();
  before(async () => {
    baseServer = await server(routeConfiguringFunction(d), 8181);
  });
  after(() => {
    baseServer.close();
  });

  describe('session handling', () => {
    it('should create session and retrieve a session id', async () => {
      let res = await request({
        url: 'http://localhost:8181/wd/hub/session',
        method: 'POST',
        json: {desiredCapabilities: {}, requiredCapabilities: {}},
        simple: false,
        resolveWithFullResponse: true
      });

      res.statusCode.should.equal(200);
      res.body.status.should.equal(0);
      should.exist(res.body.sessionId);
      res.body.value.should.eql({});
    });
  });

  describe('command timeouts', () => {
    it.skip('should throw NYI for commands not implemented', async () => {
    });

    it.skip('should timeout on commands using default commandTimeout', async () => {
    });

    it.skip('should timeout on commands using commandTimeout cap', async () => {
    });

    it.skip('should not timeout with commandTimeout of false', async () => {
    });

    it.skip('should not timeout with commandTimeout of 0', async () => {
    });
  });

  describe('settings api', () => {
    // TODO port over settings tests
  });

});