/** @flow */
import R from 'ramda';
import { Ref, BitObject } from '../objects';
import Scope from '../scope';
import Source from './source';
import { filterObject, first, bufferFrom } from '../../utils';
import ConsumerComponent from '../../consumer/component';
import { BitIds, BitId } from '../../bit-id';
import ComponentVersion from '../component-version';
import type { Doclet } from '../../jsdoc/parser';
import { DEFAULT_BUNDLE_FILENAME } from '../../constants';
import type { Results } from '../../specs-runner/specs-runner';

type CiProps = {
  error: Object,
  startTime: string,
  endTime: string,
};

type SourceFile = {
  name: string,
  path: string,
  test: boolean,
  file: Ref
}

type DistFile = {
  name: string,
  path: string,
  test: boolean,
  file: Ref
}

export type Log = {
  message: string,
  date: string,
  username: ?string,
  email: ?string,
};

export type VersionProps = {
  files?: ?Array<SourceFile>;
  dists?: ?Array<DistFile>;
  compiler?: ?BitId;
  tester?: ?BitId;
  log: Log;
  ci?: CiProps;
  specsResults?: ?Results;
  docs?: Doclet[],
  dependencies?: BitIds;
  flattenedDependencies?: BitIds;
  packageDependencies?: {[string]: string};
}

export default class Version extends BitObject {
  mainFile: string;
  files: ?Array<SourceFile>;
  dists: ?Array<DistFile>;
  compiler: ?BitId;
  tester: ?BitId;
  log: Log;
  ci: CiProps|{};
  specsResults: ?Results;
  docs: ?Doclet[];
  dependencies: Array<Object>;
  flattenedDependencies: BitIds;
  packageDependencies: {[string]: string};

  constructor({
    mainFile,
    files,
    dists,
    compiler,
    tester,
    log,
    dependencies,
    docs,
    ci,
    specsResults,
    flattenedDependencies,
    packageDependencies
  }: VersionProps) {
    super();
    this.mainFile = mainFile;
    this.files = files;
    this.dists = dists;
    this.compiler = compiler;
    this.tester = tester;
    this.log = log;
    this.dependencies = dependencies || [];
    this.docs = docs;
    this.ci = ci || {};
    this.specsResults = specsResults;
    this.flattenedDependencies = flattenedDependencies || new BitIds();
    this.packageDependencies = packageDependencies || {};
  }

  id() {
    const obj = this.toObject();

    return JSON.stringify(filterObject({
      mainFile: obj.mainFile,
      files: obj.files,
      compiler: obj.compiler,
      tester: obj.tester,
      log: obj.log,
      dependencies: obj.dependencies,
      packageDependencies: obj.packageDependencies
    }, val => !!val));
  }

  collectDependencies(scope: Scope, withDevDependencies?: bool): Promise<ComponentVersion[]> {
    const devDependencies = [ this.compiler, this.tester ];
    const allDependencies = withDevDependencies ?
    this.flattenedDependencies.concat(devDependencies) : this.flattenedDependencies;
    return scope.importManyOnes(allDependencies, true);
  }

  refs(): Ref[] {
    const files = this.files ? this.files.map(file => file.file) : [];
    const dists = this.dists ? this.dists.map(dist => dist.file) : [];
    return [
      ...dists,
      ...files,
    ].filter(ref => ref);
  }

  toObject() {
    const dependencies = this.dependencies.map((dependency) => {
      const dependencyClone = R.clone(dependency);
      dependencyClone.id = dependency.id.toString();
      return dependencyClone;
    });
    return filterObject({
      files: this.files ? this.files.map((file) => {
        return {
          file: file.file.toString(),
          relativePath: file.relativePath,
          name: file.name,
          test: file.test
        };
      }) : null,
      mainFile: this.mainFile,
      dists: this.dists ? this.dists.map((dist) => {
        return {
          file: dist.file.toString(),
          relativePath: dist.relativePath,
          name: dist.name,
          test: dist.test
        };
      }) : null,
      compiler: this.compiler ? this.compiler.toString(): null,
      tester: this.tester ? this.tester.toString(): null,
      log: {
        message: this.log.message,
        date: this.log.date,
        username: this.log.username,
        email: this.log.email,
      },
      ci: this.ci,
      specsResults: this.specsResults,
      docs: this.docs,
      dependencies,
      flattenedDependencies: this.flattenedDependencies.map(dep => dep.toString()),
      packageDependencies: this.packageDependencies
    }, val => !!val);
  }

  toBuffer(): Buffer {
    const obj = this.toObject();
    const str = JSON.stringify(obj);
    return bufferFrom(str);
  }

  static parse(contents) {
    const {
      mainFile,
      dists,
      files,
      compiler,
      tester,
      log,
      docs,
      ci,
      specsResults,
      dependencies,
      flattenedDependencies,
      packageDependencies
    } = JSON.parse(contents);
    const getDependencies = () => {
      if (dependencies.length && R.is(String, first(dependencies))) { // backward compatibility
        return dependencies.map(dependency => ({ id: BitId.parse(dependency) }));
      }

      return dependencies.map(dependency => ({
        id: BitId.parse(dependency.id),
        relativePaths: dependency.relativePaths || [{ sourceRelativePath: dependency.relativePath, destinationRelativePath: dependency.relativePath }]
      }));
    };

    return new Version({
      mainFile,
      files: files ? files.map((file) => {
        return { file: Ref.from(file.file), relativePath: file.relativePath, name: file.name, test: file.test };
      }) : null,
      dists: dists ? dists.map((dist) => {
        return { file: Ref.from(dist.file), relativePath: dist.relativePath, name: dist.name, test: dist.test };
      }) : null,
      compiler: compiler ? BitId.parse(compiler) : null,
      tester: tester ? BitId.parse(tester) : null,
      log: {
        message: log.message,
        date: log.date,
        username: log.username,
        email: log.email,
      },
      ci,
      specsResults,
      docs,
      dependencies: getDependencies(),
      flattenedDependencies: BitIds.deserialize(flattenedDependencies),
      packageDependencies,
    });
  }

  static fromComponent({
    component,
    files,
    dists,
    flattenedDeps,
    message,
    specsResults,
    username,
    email,
  }: {
    component: ConsumerComponent,
    files: ?Array<SourceFile>,
    flattenedDeps: BitId[],
    message: string,
    dists: ?Array<DistFile>,
    specsResults: ?Results,
    username: ?string,
    email: ?string,
  }) {
    return new Version({
      mainFile: component.mainFile,
      files: files ? files.map((file) => {
        return { file: file.file.hash(), relativePath: file.relativePath, name: file.name, test: file.test };
      }): null,
      dists: dists ? dists.map((dist) => {
        return { file: dist.file.hash(), relativePath: dist.relativePath, name: dist.name, test: dist.test };
      }): null,
      compiler: component.compilerId,
      tester: component.testerId,
      log: {
        message,
        username,
        email,
        date: Date.now().toString(),
      },
      specsResults,
      docs: component.docs,
      packageDependencies: component.packageDependencies,
      flattenedDependencies: flattenedDeps,
      dependencies: component.dependencies
    });
  }

  setSpecsResults(specsResults: ?Results) {
    this.specsResults = specsResults;
  }

  setDist(dist: ?Source) {
    this.dist = dist ? {
      file: dist.hash(),
      name: DEFAULT_BUNDLE_FILENAME,
    }: null;
  }

  setCIProps(ci: CiProps) {
    this.ci = ci;
  }
}
