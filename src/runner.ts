import {ThreadPoolExecutor} from "redamancy";

const isDebugMode = (): boolean => {
  return process.env.DEBUG_MODE === '1';
};

interface ElectronResult {
  test: any
  testResult: any
  error: Error
}


/**
 * Runner class
 */
export default class ElectronRunner {
  private _globalConfig: any;
  private _debugMode: boolean;

  constructor(globalConfig: any) {
    this._globalConfig = globalConfig;
    this._debugMode = isDebugMode();
  }

  private getConcurrency(testSize): number {
    const {maxWorkers, watch, watchAll} = this._globalConfig;
    const isWatch = watch || watchAll;

    const concurrency = Math.min(testSize, maxWorkers);

    return isWatch ? Math.ceil(concurrency / 2) : concurrency;
  }

  async runTests(
    tests: Array<any>,
    watcher: any,
    onStart: (Test) => void,
    onResult: (Test, TestResult) => void,
    onFailure: (Test, Error) => void,
  ) {
    // @ts-ignore
    const worker = new ThreadPoolExecutor<[any, boolean, any, any2], ElectronResult>(async (test, isDebug, gConf, moduleMap) => {
      const path = require('path')
      // @ts-ignore
      const {Electron} = require(path.resolve(__dirname, 'lib', 'electron', 'proc', 'index.js'))
      const electronProc = new Electron()
      electronProc.debugMode = isDebug;
      electronProc.concurrency = 4;

      // when the process exit, kill then electron
      process.on('exit', () => {
        electronProc.kill();
      });

      if (isDebug) {
        electronProc.onClose(() => {
          process.exit();
        });
      }

      const config = test.context.config;
      const globalConfig = gConf;

      try {
        const tmpTest = await electronProc.runTest({
          serializableModuleMap: moduleMap,
          config,
          globalConfig,
          path: test.path,
        })
        return {
          testResult: tmpTest,
          test: test,
          error: null
        }
      } catch (e) {
        return {
          test: null,
          testResult: null,
          error: e
        }
      }
    })

    worker.beforeEach((args) => {
      onStart(args[0])
    })

    worker.afterEach((res) => {
      if (res.error) {
        onFailure(res.test, res.error)
        return
      }

      if (res.testResult.failureMessage) {
        onFailure(res.test, res.testResult.failureMessage)
        return
      }
      onResult(res.test, res.testResult)
    })


    const result = await Promise.all(tests.map(t => worker.execute(t, this._debugMode, this._globalConfig, t.context.moduleMap.toJSON())));

    worker.shutdown()

    return result.map(res => res.testResult)
  }
}
