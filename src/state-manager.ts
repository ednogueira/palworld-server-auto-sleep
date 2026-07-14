export type ServerState = 'STOPPED' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'ERROR';

const ALLOWED_TRANSITIONS: Record<ServerState, readonly ServerState[]> = {
  STOPPED: ['STARTING', 'ERROR'],
  STARTING: ['RUNNING', 'STOPPED', 'ERROR'],
  RUNNING: ['STOPPING', 'STOPPED', 'ERROR'],
  STOPPING: ['STOPPED', 'ERROR'],
  ERROR: ['STOPPED', 'STARTING'],
};

export class StateManager {
  private state: ServerState;

  public constructor(initialState: ServerState = 'STOPPED') {
    this.state = initialState;
  }

  public getState(): ServerState {
    return this.state;
  }

  public canTransition(nextState: ServerState): boolean {
    if (nextState === this.state) {
      return false;
    }
    return ALLOWED_TRANSITIONS[this.state].includes(nextState);
  }

  public transition(nextState: ServerState): boolean {
    if (!this.canTransition(nextState)) {
      return false;
    }
    this.state = nextState;
    return true;
  }

  public forceTransition(nextState: ServerState): void {
    this.state = nextState;
  }
}
