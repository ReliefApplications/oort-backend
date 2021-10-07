import { authType } from '../const/enumTypes';
import { ApiConfiguration, Form, Notification, PullJob, Record } from '../models';
import pubsub from './pubsub';
import cron from 'node-cron';
import fetch from 'node-fetch';
import * as CryptoJS from 'crypto-js';
import * as dotenv from 'dotenv';
import { getToken } from '../utils/proxy'
dotenv.config();
const taskMap = {};

/* Global function called on server start to initialize all the pullJobs.
*/
export default async function pullJobScheduler() {

    const pullJobs = await PullJob.find({ status: 'active' }).populate({
        path: 'apiConfiguration',
        model: 'ApiConfiguration',
    });

    for (const pullJob of pullJobs) {
        scheduleJob(pullJob);
    }
}

/* Schedule or re-schedule a pullJob.
*/
export function scheduleJob(pullJob: PullJob) {
    const task = taskMap[pullJob.id];
    if (task) {
        task.stop();
    }
    taskMap[pullJob.id] = cron.schedule(pullJob.schedule, async () => {
        console.log('📥 Starting a pull from job ' + pullJob.name);
        const apiConfiguration: ApiConfiguration = pullJob.apiConfiguration;
        if (apiConfiguration.authType === authType.serviceToService) {

            // Decrypt settings
            const settings: { authTargetUrl: string, apiClientID: string, safeSecret: string, safeID: string, scope: string }
        = JSON.parse(CryptoJS.AES.decrypt(apiConfiguration.settings, process.env.AES_ENCRYPTION_KEY).toString(CryptoJS.enc.Utf8));

            // Get auth token and start pull Logic
            const token: string = await getToken(apiConfiguration);
            fetchRecordsServiceToService(pullJob, settings, token);
        }
    });
    console.log('📅 Scheduled job ' + pullJob.name);
}

/* Unschedule an existing pullJob from its id.
*/
export function unscheduleJob(pullJob: {id?: string, name?: string}): void {
    const task = taskMap[pullJob.id];
    if (task) {
        task.stop();
        console.log(`📆 Unscheduled job ${pullJob.name ? pullJob.name : pullJob.id}`);
    }
}

/* FetchRecords using the hardcoded workflow for service-to-service API type (EIOS).
*/
function fetchRecordsServiceToService(pullJob: PullJob, settings: {
    authTargetUrl: string,
    apiClientID: string,
    safeSecret: string,
    safeID: string,
    scope: string
}, token: string): void {
    const apiConfiguration: ApiConfiguration = pullJob.apiConfiguration;
    // === HARD CODED ENDPOINTS ===
    const boardsUrl = 'GetBoards?tags=signal+app';
    const articlesUrl = 'GetPinnedArticles';
    // === HARD CODED ENDPOINTS ===
    const headers = {
        'Authorization': 'Bearer ' + token
    }
    if (settings.safeID && !settings.scope) {
        headers['ConsumerId'] = settings.safeID;
    }
    fetch(apiConfiguration.endpoint + boardsUrl, {
        method: 'get',
        headers
    })
    .then(res => res.json())
    .then(json => {
        if (json && json.result) {
            const boardIds = json.result.map(x => x.id);
            fetch(`${apiConfiguration.endpoint}${articlesUrl}?boardIds=${boardIds}`, {
                method: 'get',
                headers
            })
            .then(res => res.json())
            .then(json => {
                if (json && json.result) {
                    insertRecords(json.result, pullJob);
                }
            });
        }
    });
}

/* Use the fetched data to insert records into the dB if needed.
*/
export async function insertRecords(data: any[], pullJob: PullJob): Promise<void> {
    const form = await Form.findById(pullJob.convertTo);
    if (form) {
        const records = [];
        const unicityConditions = pullJob.uniqueIdentifiers;
        // Map unicity conditions to check if we already have some corresponding records in the DB 
        const mappedUnicityConditions = unicityConditions.map(x => Object.keys(pullJob.mapping).find(key => pullJob.mapping[key] === x));
        const filters = [];
        for (let elementIndex = 0; elementIndex < data.length; elementIndex ++) {
            const element = data[elementIndex];
            const filter = {};
            for (let unicityIndex = 0; unicityIndex < unicityConditions.length; unicityIndex ++) {
                const identifier = unicityConditions[unicityIndex];
                const mappedIdentifier = mappedUnicityConditions[unicityIndex];
                // Check if it's an automatically generated element which already have some part of the identifiers set up
                const value = element[`__${identifier}`] === undefined ? accessFieldIncludingNested(element, identifier) : element[`__${identifier}`];
                // Prevent adding new records with identifier null, or type object or array with any at least one null value in it.
                if (!value || (typeof value === 'object' && (Array.isArray(value) && value.some(x => x === null || x === undefined) || !Array.isArray(value)))) {
                    element.__notValid = true;
                // If a uniqueIdentifier value is an array, duplicate the element and add filter for the first one since the other will be handled in subsequent steps
                } else if (Array.isArray(value)) {
                    for (const val of value) {
                        // Push new element if not the first one
                        if (val === value[0]) {
                            element[`__${identifier}`] = val;
                            Object.assign(filter, { [`data.${mappedIdentifier}`]: val });
                        } else {
                            const newElement = Object.assign({}, element);
                            newElement[`__${identifier}`] = val;
                            data.splice(elementIndex + 1, 0, newElement);
                        }
                    }
                } else {
                    element[`__${identifier}`] = value;
                    Object.assign(filter, { [`data.${mappedIdentifier}`]: value });
                }
            }
            filters.push(filter);
        }
        // Find records already existing if any
        const selectedFields = mappedUnicityConditions.map(x => `data.${x}`);
        const duplicateRecords = await Record.find({ form: pullJob.convertTo, $or: filters}).select(selectedFields);
        data.forEach(element => {
            const mappedElement = mapData(pullJob.mapping, element, form.fields);
            // Adapt identifiers after mapping so if arrays are involved, it will correspond to each element of teh array
            for (let unicityIndex = 0; unicityIndex < unicityConditions.length; unicityIndex ++) {
                const identifier = unicityConditions[unicityIndex];
                const mappedIdentifier = mappedUnicityConditions[unicityIndex];
                mappedElement[mappedIdentifier] = element[`__${identifier}`];
            }
            // Check if element is already stored in the DB and if it has unique identifiers correctly set up
            const isDuplicate = element.__notValid ? true : duplicateRecords.some(record => {
                for (let unicityIndex = 0; unicityIndex < unicityConditions.length; unicityIndex ++) {
                    const identifier = unicityConditions[unicityIndex];
                    const mappedIdentifier = mappedUnicityConditions[unicityIndex];
                    const recordValue = record.data[mappedIdentifier];
                    const elementValue = element[`__${identifier}`];
                    if (recordValue !== elementValue) {
                        return false;
                    }
                }
                return true;
            });
            if (!isDuplicate) {
                records.push(new Record({
                    form: pullJob.convertTo,
                    createdAt: new Date(),
                    modifiedAt: new Date(),
                    data: mappedElement,
                    resource: form.resource ? form.resource : null
                }));
            }
        });
        Record.insertMany(records, {}, async () => {
            if (pullJob.channel && records.length > 0) {
                const notification = new Notification({
                    action: `${records.length} ${form.name} created from ${pullJob.name}`,
                    content: '',
                    createdAt: new Date(),
                    channel: pullJob.channel.toString(),
                    seenBy: []
                });
                await notification.save();
                const publisher = await pubsub();
                publisher.publish(pullJob.channel.toString(), { notification });
            }
        });
    }
}

/* Map the data retrieved so it match with the target Form.
*/
export function mapData(mapping: any, data: any, fields: any): any {
    const out = {};
    if (mapping) {
        for (const key of Object.keys(mapping)) {
            const identifier = mapping[key];
            if (identifier.startsWith('$$')) {
                // Put the raw string passed if it begins with $$
                out[key] = identifier.substring(2);
            } else {
                // Access field
                let value = accessFieldIncludingNested(data, identifier);
                if (Array.isArray(value) && fields.find(x => x.name === key).type === 'text') {
                    value = value.toString();
                }
                out[key] = value;
            }
        }
        return out;
    } else {
        return data;
    }
}

/* Access property of passed object including nested properties and map properties on array if needed.
*/
function accessFieldIncludingNested(data: any, identifier: string) {
    if (identifier.includes('.')) {
        // Loop to access nested elements if we have .
        const fields: any[] = identifier.split('.');
        const firstField = fields.shift();
        let value = data[firstField];
        for (const field of fields) {
            if (value) {
                if (Array.isArray(value) && isNaN(field)) {
                    value = value.flatMap(x => x ? x[field] : null);
                } else {
                    value = value[field];
                }
            } else {
                return null;
            }
        }
        return value;
    } else {
        // Map to corresponding property
        return data[identifier];
    }
}
