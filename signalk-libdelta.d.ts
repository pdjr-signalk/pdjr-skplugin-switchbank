/**********************************************************************
 * Copyright 2020 Paul Reeve <preeve@pdjr.eu>
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you
 * may not use this file except in compliance with the License. You
 * may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
 * implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */
export declare class Delta {
    private app;
    private source;
    private values;
    private metas;
    constructor(app: any, source: string);
    clear(): Delta;
    addValue(path: string, value: any): Delta;
    addValues(values: any): Delta;
    addMeta(path: string, value: any): Delta;
    addMetas(values: any): Delta;
    count(): number;
    commit(dump?: number): Delta;
    dump(): void;
}
