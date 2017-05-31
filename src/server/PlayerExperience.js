import { Experience } from 'soundworks/server';
import sceneConfig from '../shared/scenes-config';
import Scheduler from './Scheduler';
import LedDisplay from './LedDisplay';
import SceneOff from './scenes/off';
import SceneCo909 from './scenes/co-909';
import SceneCollectiveLoops from './scenes/collective-loops';
import SceneCoMix from './scenes/co-mix';

const sceneCtors = {
  'off': SceneOff,
  'co-909': SceneCo909,
  'collective-loops': SceneCollectiveLoops,
  'co-mix': SceneCoMix,
};

export default class PlayerExperience extends Experience {
  constructor(clientType) {
    super(clientType);

    // client/server services
    this.sharedParams = this.require('shared-params');
    this.checkin = this.require('checkin');
    this.audioBufferManager = this.require('audio-buffer-manager');
    this.syncScheduler = this.require('sync-scheduler');
    this.metricScheduler = this.require('metric-scheduler', { tempo: 120, tempoUnit: 1 / 4 });
    this.sync = this.require('sync');

    this.scheduler = null;
    this.scenes = {};
    this.currentScene = null;

    this.onSceneChange = this.onSceneChange.bind(this);
    this.onTempoChange = this.onTempoChange.bind(this);
    this.onClear = this.onClear.bind(this);
    this.onTemperature = this.onTemperature.bind(this);
  }

  start() {
    this.scheduler = new Scheduler(this.sync);

    this.ledDisplay = new LedDisplay();
    this.ledDisplay.connect(null, () => {
      // null means automatic port search, otherwise put something like : /dev/tty.wchusbserial1420

      this.ledDisplay.addListener('temperature', this.onTemperature);
      this.ledDisplay.requestTemperature();
    });

    this.initScenes();

    this.sharedParams.addParamListener('scene', this.onSceneChange);
    this.sharedParams.addParamListener('tempo', this.onTempoChange);
    this.sharedParams.addParamListener('clear', this.onClear);
  }

  enterCurrentScene() {
    this.currentScene.enter();

    for (let client of this.clients)
      this.currentScene.clientEnter(client);    
  }

  exitCurrentScene() {
    this.currentScene.exit();

    for (let client of this.clients)
      this.currentScene.clientExit(client);    
  }

  enter(client) {
    super.enter(client);

    this.currentScene.clientEnter(client);

    this.broadcast('barrel', null, 'connectClient', client.index);
    this.sharedParams.update('numPlayers', this.clients.length);
  }

  exit(client) {
    super.exit(client);

    this.currentScene.clientExit(client);

    this.broadcast('barrel', null, 'disconnectClient', client.index);
    this.sharedParams.update('numPlayers', this.clients.length);
  }

  initScenes() {
    for (let scene in sceneCtors) {
      const ctor = sceneCtors[scene];
      const config = sceneConfig[scene];

      if (config)
        this.scenes[scene] = new ctor(this, config);
      else
        throw new Error(`Cannot find config for scene '${scene}'`);
    }

    this.currentScene = this.scenes.off;
    this.enterCurrentScene();
  }

  onSceneChange(value) {
    this.exitCurrentScene();
    this.currentScene = this.scenes[value];
    this.enterCurrentScene();
  }

  onTempoChange(tempo) {
    const setSceneTempo = this.currentScene.setTempo;

    if (setSceneTempo)
      setSceneTempo(tempo);

    const syncTime = this.metricScheduler.syncTime;
    const metricPosition = this.metricScheduler.getMetricPositionAtSyncTime(syncTime);
    this.metricScheduler.sync(syncTime, metricPosition, tempo, 1/4, 'tempoChange');
  }

  onClear() {
    const clearScene = this.currentScene.clear;

    if(clearScene)
      clearScene();
  }

  onTemperature(data) {
    console.log('temperature:', data);
    this.sharedParams.update('temperature', data);
  }
}
