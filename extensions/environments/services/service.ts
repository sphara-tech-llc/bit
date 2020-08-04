import { Component } from '@teambit/component';

export type EnvContext = {
  components: Component[];
};

export interface Service {
  /**
   * executes a service on a subset of components.
   */
  run(context: EnvContext): any;
}