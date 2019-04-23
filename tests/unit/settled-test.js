import Ember from 'ember';
import { module, test } from 'qunit';
import { isSettled, getSettledState } from '@ember/test-helpers';
import { TestDebugInfo } from '@ember/test-helpers/-internal/debug-info';
import hasEmberVersion from '@ember/test-helpers/has-ember-version';
import { _setupAJAXHooks, _teardownAJAXHooks } from '@ember/test-helpers/settled';
import { next, later, run, schedule } from '@ember/runloop';
import { buildWaiter, _reset as resetWaiters } from 'ember-test-waiters';
import Pretender from 'pretender';
import hasjQuery from '../helpers/has-jquery';
import ajax from '../helpers/ajax';

const WAITER_NAME = 'custom-waiter';

module('settled', function(hooks) {
  if (!hasEmberVersion(2, 4)) {
    return;
  }

  hooks.beforeEach(function(assert) {
    _setupAJAXHooks();

    this.confirmSettles = done => {
      return function() {
        setTimeout(() => {
          assert.strictEqual(isSettled(), true, 'post cond - isSettled');
          assert.deepEqual(
            getSettledState(),
            {
              hasPendingRequests: false,
              hasPendingTimers: false,
              hasPendingLegacyWaiters: false,
              hasPendingTestWaiters: false,
              hasPendingTransitions: null,
              hasRunLoop: false,
              pendingRequestCount: 0,
              debugInfo: new TestDebugInfo(false, false, false, false, false),
            },
            'post cond - getSettledState'
          );

          done();
        });
      };
    };

    this.server = new Pretender(function() {
      this.get(
        '/whazzits',
        function() {
          return [200, { 'Content-Type': 'text/plain' }, 'Remote Data!'];
        },
        25
      );
    });

    this._legacyWaiter = () => {
      return !this.isWaiterPending;
    };

    // In Ember < 2.8 `registerWaiter` expected to be bound to
    // `Ember.Test` 😭
    //
    // Once we have dropped support for < 2.8 we should swap this to
    // use:
    //
    // import { registerWaiter } from '@ember/test';
    Ember.Test.registerWaiter(this._legacyWaiter);

    this._testWaiter = buildWaiter(WAITER_NAME);
  });

  hooks.afterEach(function() {
    Ember.Test.unregisterWaiter(this._legacyWaiter);
    resetWaiters();
    this.server.shutdown();
    _teardownAJAXHooks();
  });

  module('isSettled', function() {
    test('when no work is scheduled, no requests, waiters completed', function(assert) {
      assert.strictEqual(isSettled(), true);
    });

    test('when work is scheduled via run.schedule', function(assert) {
      assert.expect(4);
      let done = assert.async();

      assert.strictEqual(isSettled(), true, 'precond');

      schedule('actions', this.confirmSettles(done));

      assert.strictEqual(isSettled(), false);
    });

    test('when work is scheduled via run.next', function(assert) {
      assert.expect(4);

      let done = assert.async();

      assert.strictEqual(isSettled(), true, 'precond');

      next(this.confirmSettles(done));

      assert.strictEqual(isSettled(), false);
    });

    test('when work is scheduled via run.later', function(assert) {
      assert.expect(4);

      let done = assert.async();

      assert.strictEqual(isSettled(), true, 'precond');

      later(this.confirmSettles(done), 15);

      assert.strictEqual(isSettled(), false);
    });

    test('when invocation is within a run loop', function(assert) {
      assert.expect(3);

      assert.strictEqual(isSettled(), true, 'precond');

      run(() => {
        assert.strictEqual(isSettled(), false);
      });

      assert.strictEqual(isSettled(), true, 'post cond');
    });

    test('when AJAX requests are pending', function(assert) {
      assert.expect(4);

      let done = assert.async();

      assert.strictEqual(isSettled(), true, 'precond');

      ajax('/whazzits').then(this.confirmSettles(done));

      assert.strictEqual(isSettled(), false);
    });

    test('when legacy waiters are pending', function(assert) {
      assert.expect(3);

      assert.strictEqual(isSettled(), true, 'precond');

      this.isWaiterPending = true;

      assert.strictEqual(isSettled(), false);

      this.isWaiterPending = false;

      assert.strictEqual(isSettled(), true, 'post cond');
    });

    test('when test waiters are pending', function(assert) {
      assert.expect(3);

      let waiterItem = {};

      assert.strictEqual(isSettled(), true, 'precond');

      this._testWaiter.beginAsync(waiterItem);

      assert.strictEqual(isSettled(), false);

      this._testWaiter.endAsync(waiterItem);

      assert.strictEqual(isSettled(), true, 'post cond');
    });
  });

  module('getSettledState', function() {
    test('when no work is scheduled, no requests, waiters completed', function(assert) {
      assert.deepEqual(getSettledState(), {
        hasPendingRequests: false,
        hasPendingTimers: false,
        hasPendingLegacyWaiters: false,
        hasPendingTestWaiters: false,
        hasPendingTransitions: null,
        hasRunLoop: false,
        pendingRequestCount: 0,
        debugInfo: new TestDebugInfo(false, false, false, false, false),
      });
    });

    test('when work is scheduled via run.schedule', function(assert) {
      assert.expect(4);
      let done = assert.async();

      assert.strictEqual(isSettled(), true, 'precond');

      schedule('actions', this.confirmSettles(done));

      assert.deepEqual(getSettledState(), {
        hasPendingRequests: false,
        hasPendingTimers: true,
        hasPendingLegacyWaiters: false,
        hasPendingTestWaiters: false,
        hasPendingTransitions: null,
        hasRunLoop: true,
        pendingRequestCount: 0,
        debugInfo: new TestDebugInfo(true, true, false, false, false),
      });
    });

    test('when work is scheduled via run.next', function(assert) {
      assert.expect(4);

      let done = assert.async();

      assert.strictEqual(isSettled(), true, 'precond');

      next(this.confirmSettles(done));

      assert.deepEqual(getSettledState(), {
        hasPendingRequests: false,
        hasPendingTimers: true,
        hasPendingLegacyWaiters: false,
        hasPendingTestWaiters: false,
        hasPendingTransitions: null,
        hasRunLoop: false,
        pendingRequestCount: 0,
        debugInfo: new TestDebugInfo(true, false, false, false, false),
      });
    });

    test('when work is scheduled via run.later', function(assert) {
      assert.expect(4);

      let done = assert.async();

      assert.strictEqual(isSettled(), true, 'precond');

      later(this.confirmSettles(done), 15);

      assert.deepEqual(getSettledState(), {
        hasPendingRequests: false,
        hasPendingTimers: true,
        hasPendingLegacyWaiters: false,
        hasPendingTestWaiters: false,
        hasPendingTransitions: null,
        hasRunLoop: false,
        pendingRequestCount: 0,
        debugInfo: new TestDebugInfo(true, false, false, false, false),
      });
    });

    test('when invocation is within a run loop', function(assert) {
      assert.expect(3);

      assert.strictEqual(isSettled(), true, 'precond');

      run(() => {
        assert.deepEqual(getSettledState(), {
          hasPendingRequests: false,
          hasPendingTimers: false,
          hasPendingLegacyWaiters: false,
          hasPendingTestWaiters: false,
          hasPendingTransitions: null,
          hasRunLoop: true,
          pendingRequestCount: 0,
          debugInfo: new TestDebugInfo(false, true, false, false, false),
        });
      });

      assert.strictEqual(isSettled(), true, 'post cond');
    });

    test('when AJAX requests are pending', function(assert) {
      assert.expect(4);

      let done = assert.async();

      assert.strictEqual(isSettled(), true, 'precond');

      ajax('/whazzits').then(this.confirmSettles(done));

      /*
        When testing without jQuery `ajax` is provided by ember-fetch which uses a test waiter
        to ensure tests wait for pending `fetch` requests, but under jQuery.ajax we use global
        ajax start/stop timers
      */
      if (hasjQuery()) {
        assert.deepEqual(getSettledState(), {
          hasPendingRequests: true,
          hasPendingTimers: false,
          hasPendingLegacyWaiters: false,
          hasPendingTestWaiters: false,
          hasPendingTransitions: null,
          hasRunLoop: false,
          pendingRequestCount: 1,
          debugInfo: new TestDebugInfo(false, false, false, false, true),
        });
      } else {
        assert.deepEqual(getSettledState(), {
          hasPendingRequests: false,
          hasPendingTimers: false,
          hasPendingLegacyWaiters: true,
          hasPendingTestWaiters: false,
          hasPendingTransitions: null,
          hasRunLoop: false,
          pendingRequestCount: 0,
          debugInfo: new TestDebugInfo(false, false, true, false, false),
        });
      }
    });

    test('when legacy waiters are pending', function(assert) {
      assert.expect(3);

      assert.strictEqual(isSettled(), true, 'precond');

      this.isWaiterPending = true;

      assert.deepEqual(getSettledState(), {
        hasPendingRequests: false,
        hasPendingTimers: false,
        hasPendingLegacyWaiters: true,
        hasPendingTestWaiters: false,
        hasPendingTransitions: null,
        hasRunLoop: false,
        pendingRequestCount: 0,
        debugInfo: new TestDebugInfo(false, false, true, false, false),
      });

      this.isWaiterPending = false;

      assert.strictEqual(isSettled(), true, 'post cond');
    });

    test('when test waiters are pending', function(assert) {
      assert.expect(3);

      let waiterItem = {};

      assert.strictEqual(isSettled(), true, 'precond');

      this._testWaiter.beginAsync(waiterItem);

      assert.deepEqual(getSettledState(), {
        hasPendingRequests: false,
        hasPendingTimers: false,
        hasPendingLegacyWaiters: false,
        hasPendingTestWaiters: true,
        hasPendingTransitions: null,
        hasRunLoop: false,
        pendingRequestCount: 0,
        debugInfo: new TestDebugInfo(false, false, false, true, false),
      });

      this._testWaiter.endAsync(waiterItem);

      assert.strictEqual(isSettled(), true, 'post cond');
    });

    test('all the things!', function(assert) {
      assert.expect(6);
      let done = assert.async();
      assert.strictEqual(isSettled(), true, 'precond');

      this.isWaiterPending = true;

      assert.deepEqual(getSettledState(), {
        hasPendingRequests: false,
        hasPendingTimers: false,
        hasPendingLegacyWaiters: true,
        hasPendingTestWaiters: false,
        hasPendingTransitions: null,
        hasRunLoop: false,
        pendingRequestCount: 0,
        debugInfo: new TestDebugInfo(false, false, true, false, false),
      });

      run(() => {
        assert.deepEqual(getSettledState(), {
          hasPendingRequests: false,
          hasPendingTimers: false,
          hasPendingLegacyWaiters: true,
          hasPendingTestWaiters: false,
          hasPendingTransitions: null,
          hasRunLoop: true,
          pendingRequestCount: 0,
          debugInfo: new TestDebugInfo(false, true, true, false, false),
        });

        next(this.confirmSettles(done));

        assert.deepEqual(getSettledState(), {
          hasPendingRequests: false,
          hasPendingTimers: true,
          hasPendingLegacyWaiters: true,
          hasPendingTestWaiters: false,
          hasPendingTransitions: null,
          hasRunLoop: true,
          pendingRequestCount: 0,
          debugInfo: new TestDebugInfo(true, true, true, false, false),
        });

        this.isWaiterPending = false;
      });
    });
  });
});
