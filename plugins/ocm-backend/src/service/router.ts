/*
 * Copyright 2020 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { errorHandler } from '@backstage/backend-common';
import { Config } from '@backstage/config';
import express from 'express';
import Router from 'express-promise-router';
import { Logger } from 'winston';
import { HUB_CLUSTER_NAME_IN_OCM } from '../constants';
import {
  getManagedCluster,
  getManagedClusters,
  getManagedClustersInfo,
  hubApiClient,
} from '../helpers/kubernetes';
import { parseManagedCluster, parseUpdateInfo } from '../helpers/parser';
import { getHubClusterName } from '../helpers/config';

export interface RouterOptions {
  logger: Logger;
  config: Config;
}

export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { logger } = options;
  const { config } = options;

  const hubClusterName = getHubClusterName(config);
  const api = hubApiClient(config, logger);

  const router = Router();
  router.use(express.json());

  router.get(
    '/status/:clusterName',
    ({ params: { clusterName } }, response) => {
      logger.info(`Incoming status request for ${clusterName} cluster`);

      const normalizedClusterName =
        clusterName === hubClusterName ? HUB_CLUSTER_NAME_IN_OCM : clusterName;

      return (
        getManagedCluster(api, normalizedClusterName) as Promise<any>
      ).then(async resp => {
        response.send({
          ...parseManagedCluster(resp),
          ...parseUpdateInfo(
            (await (getManagedClustersInfo(api) as Promise<any>)).items.find(
              (clusterInfo: any) =>
                clusterInfo.metadata.name === normalizedClusterName,
            ),
          ),
        });
      });
    },
  );

  router.get('/status', (_, response) => {
    logger.info(`Incoming status request for all clusters`);

    return (getManagedClusters(api) as Promise<any>).then(async resp => {
      const clusterInfo = (await (getManagedClustersInfo(api) as Promise<any>))
        .items;

      response.send(
        resp.items.map((clusterStatus: any, index: number) => {
          return {
            ...parseManagedCluster(clusterStatus),
            ...parseUpdateInfo(clusterInfo[index]),
          };
        }),
      );
    });
  });

  router.use(errorHandler({ logClientErrors: true }));

  return router;
}
