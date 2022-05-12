import { Record, User, Role } from '../../models';
import { ChangeType, RecordHistoryType } from 'models/history';
import { AppAbility } from 'security/defineAbilityFor';

/**
 * Class used to get a record's history
 */
export class RecordHistory {
  fields: any[] = [];

  /**
   * Initializes a RecordHistory object with the given record
   *
   * @param record the record to get the history from
   * @param options options
   * @param options.translate the i18n function for translations
   * @param options.ability the users ability to see data
   */
  constructor(
    private record: Record,
    private options: {
      translate: (key: string) => string;
      ability: AppAbility;
    }
  ) {
    this.extractFields();
  }

  /**
   * Parses the structure of the record and
   * initializes the fields array
   */
  private extractFields() {
    if (!this.record.form || !this.record.form.structure) return;
    const structure = JSON.parse(this.record.form.structure);

    if (!structure.pages || !structure.pages.length) return;

    structure.pages.forEach((page) => {
      this.fields.push(...page.elements);
    });

    // dealing with panels by extracting all of their field elements
    while (true) {
      let remove: number | undefined;
      this.fields.forEach((field, i) => {
        if (field.type === 'panel') {
          remove = i;
          this.fields.push(...field.elements);
          return;
        }
      });
      if (remove !== undefined) this.fields.splice(remove, 1);
      else break;
    }
  }

  /**
   * Gets the label or title for a given field name when available or the name itself when not
   *
   * @param key Name of the field
   * @returns The display name for a field
   */
  private getDisplayName(key: string) {
    const field = this.fields.find((item) => item.name === key);
    if (field) return field.title || field.name;
    return key;
  }

  /**
   * Get the change object for field modification
   *
   * @param key The field name
   * @param after The subsequent version
   * @param current The current version
   * @returns The change object
   */
  private modifyField(key: string, after: any, current: any): ChangeType {
    if (after[key] === null) {
      return {
        type: this.options.translate('history.value.delete'),
        displayName: this.getDisplayName(key),
        field: key,
        old: current[key],
      };
    } else {
      return {
        type: this.options.translate('history.value.change'),
        displayName: this.getDisplayName(key),
        field: key,
        old: current[key],
        new: after[key],
      };
    }
  }

  /**
   * Get the change object for value insertion
   *
   * @param key The field name
   * @param current The current version
   * @returns The change object
   */
  private addField(key: string, current: any): ChangeType {
    return {
      type: this.options.translate('history.value.add'),
      displayName: this.getDisplayName(key),
      field: key,
      new: current[key],
    };
  }

  /**
   * Get the change object for field modification
   *
   * @param after The subsequent version
   * @param current The current version
   * @param key The field name
   * @returns The change object
   */
  private modifyObjects(
    after: any,
    current: any,
    key: string
  ): ChangeType | undefined {
    const afterKeys = Object.keys(after[key] ? after[key] : current[key]);

    const res: ChangeType = {
      type: this.options.translate('history.value.change'),
      displayName: this.getDisplayName(key),
      field: key,
      old: {},
      new: {},
    };

    afterKeys.forEach((k) => {
      let afterValues = [];
      let currentValues = [];
      if (after[key] && after[key][k]) {
        if (after[key][k] instanceof Object) {
          afterValues = Object.values(after[key][k]);
        } else {
          afterValues = after[key][k];
        }
      }
      if (current[key] && current[key][k]) {
        if (current[key][k] instanceof Object) {
          currentValues = Object.values(current[key][k]);
        } else {
          currentValues = current[key][k];
        }
      }

      if (currentValues.toString() !== afterValues.toString()) {
        res.new[k] = afterValues;
        res.old[k] = currentValues;
      }
    });

    if (Object.keys(res.new).length > 0) return res;
  }

  /**
   * Get the change object for object field insertion
   *
   * @param current The current version
   * @param key The field name
   * @returns The change object
   */
  private addObject(current: any, key: string): ChangeType {
    const currentKeys = Object.keys(current[key]);

    const res: ChangeType = {
      type: this.options.translate('history.value.add'),
      displayName: this.getDisplayName(key),
      field: key,
      new: {},
    };

    currentKeys.forEach((k) => {
      let currentValues: any;
      if (current[key][k] instanceof Object) {
        currentValues = Object.values(current[key][k]);
      } else {
        currentValues = current[key][k];
      }
      res.new[k] = currentValues;
    });

    return res;
  }

  /**
   * Gets the difference between two versions of a record
   *
   * @param current initial version of the record
   * @param after subsequent version of the record
   * @returns The difference between the varsions
   */
  private getDifference(current: any, after: any) {
    const changes: ChangeType[] = [];

    if (current) {
      const keysCurrent = Object.keys(current);
      keysCurrent.forEach((key) => {
        if (
          typeof after[key] === 'boolean' ||
          typeof current[key] === 'boolean'
        ) {
          if (current[key] !== null && after[key] !== current[key]) {
            changes.push(this.modifyField(key, after, current));
          }
        } else if (!Array.isArray(after[key]) && !Array.isArray(current[key])) {
          if (after[key]) {
            if (after[key] instanceof Object && current[key]) {
              const element = this.modifyObjects(after, current, key);
              if (element) {
                changes.push(element);
              }
            } else if (current[key] && after[key] !== current[key]) {
              changes.push(this.modifyField(key, after, current));
            }
          } else if (current[key]) {
            if (current[key] instanceof Object) {
              const element = this.modifyObjects(after, current, key);
              if (element) {
                changes.push(element);
              }
            } else if (after[key] !== current[key]) {
              changes.push(this.modifyField(key, after, current));
            } else {
              changes.push(this.addField(key, current));
            }
          }
        } else {
          if (
            (!after[key] && current[key]) ||
            (current[key] &&
              after[key] &&
              after[key].toString() !== current[key].toString())
          ) {
            changes.push(this.modifyField(key, after, current));
          } else if (!after[key] && current[key]) {
            changes.push(this.addField(key, current));
          }
        }
      });
    }

    const keysAfter = Object.keys(after);
    keysAfter.forEach((key) => {
      if (typeof after[key] === 'boolean') {
        if ((!current || current[key]) === null && after[key] !== null) {
          changes.push({
            type: this.options.translate('history.value.add'),
            displayName: this.getDisplayName(key),
            field: key,
            new: after[key],
          });
        }
      } else if (
        (!current || current[key] === null || current[key] === undefined) &&
        !Array.isArray(after[key]) &&
        after[key] instanceof Object
      ) {
        const element = this.addObject(after, key);
        changes.push(element);
      } else if (
        (!current || current[key] === null || current[key] === undefined) &&
        after[key]
      ) {
        changes.push({
          type: this.options.translate('history.value.add'),
          displayName: this.getDisplayName(key),
          field: key,
          new: after[key],
        });
      }
    });
    return changes;
  }

  /**
   * Gets the list of changes per version of a record
   *
   * @returns A list of changes
   */
  async getHistory() {
    const res: RecordHistoryType = [];
    const versions = this.record.versions || [];
    let difference: any;
    if (versions.length === 0) {
      difference = this.getDifference(null, this.record.data);
      res.push({
        created: this.record.createdAt,
        createdBy: this.record.createdBy?.user?.name,
        changes: difference,
      });
      return res;
    }

    difference = this.getDifference(null, versions[0].data);
    res.push({
      created: versions[0].createdAt,
      createdBy: this.record.createdBy?.user?.name,
      changes: difference,
    });

    for (let i = 1; i < versions.length; i++) {
      difference = this.getDifference(versions[i - 1].data, versions[i].data);
      res.push({
        created: versions[i].createdAt,
        createdBy: versions[i - 1].createdBy?.name,
        changes: difference,
      });
    }
    difference = this.getDifference(
      versions[versions.length - 1].data,
      this.record.data
    );
    res.push({
      created: this.record.modifiedAt,
      createdBy: versions[versions.length - 1].createdBy?.name,
      changes: difference,
    });

    const formated = await this.formatValues(res.reverse());
    return formated;
  }

  /**
   * Gets the label or title for a given field value when available or the value itself when not
   *
   * @param history Record history to be formated
   * @returns The record history with formated values
   */
  private async formatValues(history: RecordHistoryType) {
    const getOptionFromChoices = (
      value: string,
      choices: { value: string; text: string }[]
    ) => {
      const choice = choices.find((c) => c.value === value);
      return choice === undefined ? value : choice.text;
    };

    const getMatrixTextFromValue = (
      value: any,
      search: 'rows' | 'columns',
      field: any
    ) => {
      const elem = field[search].find((f) => f.value === value);
      if (!elem) return value;
      return elem.text;
    };

    const getTitleFromName = (
      name: string,
      array: { name: string; title: string }[]
    ) => {
      return array.find((c) => c.name === name).title;
    };

    const getResourcesIncrementalID = async (ids: string[]) => {
      const recordFilters = Record.accessibleBy(this.options.ability, 'read')
        .where({ _id: { $in: ids }, archived: { $ne: true } })
        .getFilter();
      const records: Record[] = await Record.find(recordFilters);
      return records.map((record) => record.incrementalId);
    };

    const getUsersFromID = async (ids: string[]) => {
      const userFilters = User.accessibleBy(this.options.ability, 'read')
        .where({ _id: { $in: ids }, archived: { $ne: true } })
        .getFilter();
      const users: User[] = await User.find(userFilters);
      return users.map((user) => user.username);
    };

    const getOwner = async (id: string) => {
      const roleFilters = Role.accessibleBy(this.options.ability, 'read')
        .where({ _id: id, archived: { $ne: true } })
        .getFilter();
      const role: Role = await Role.findOne(roleFilters).populate({
        path: 'application',
        model: 'Application',
      });
      return `${role.application.name} - ${role.title}`;
    };

    for (const version of history) {
      for (const change of version.changes) {
        const field = this.fields.find((f) => f.name === change.field);

        if (!field) continue;
        switch (field.type) {
          case 'radiogroup':
          case 'dropdown':
            if (change.old !== undefined)
              change.old = getOptionFromChoices(change.old, field.choices);
            if (change.new !== undefined)
              change.new = getOptionFromChoices(change.new, field.choices);
            break;
          case 'tagbox':
          case 'checkbox':
            if (change.old !== undefined)
              change.old = change.old.map((item: string) =>
                getOptionFromChoices(item, field.choices)
              );
            if (change.new !== undefined)
              change.new = change.new.map((item: string) =>
                getOptionFromChoices(item, field.choices)
              );
            break;
          case 'file':
            if (change.old !== undefined)
              change.old = change.old.map((file: any) => file.name);
            if (change.new !== undefined)
              change.new = change.new.map((file: any) => file.name);
            break;
          case 'multipletext':
            ['new', 'old'].forEach((state) => {
              if (change[state] !== undefined) {
                const keys = Object.keys(change[state]);
                keys.forEach((key) => {
                  const newKey = getTitleFromName(key, field.items);
                  const valCpy = change[state][key];

                  delete change[state][key];
                  Object.assign(change[state], { [newKey]: valCpy });
                });
              }
            });
            break;
          case 'matrix':
            ['new', 'old'].forEach((state) => {
              if (change[state] !== undefined) {
                for (const key in change[state]) {
                  const newKey = getMatrixTextFromValue(key, 'rows', field);
                  const newVal = getMatrixTextFromValue(
                    change[state][key],
                    'columns',
                    field
                  );

                  delete change[state][key];
                  Object.assign(change[state], { [newKey]: newVal });
                }
              }
            });
            break;
          case 'matrixdropdown':
            ['new', 'old'].forEach((state) => {
              if (change[state] !== undefined) {
                const keys = Object.keys(change[state]);
                keys.forEach((key) => {
                  const newKey = getMatrixTextFromValue(key, 'rows', field);
                  const cols = field.columns.map((elem) => elem.title);

                  cols.forEach((col, i) => {
                    let newVal = change[state][key][i];
                    switch (field.columns[i].cellType) {
                      case 'radiogroup':
                      case 'dropdown':
                        newVal = getOptionFromChoices(newVal, field.choices);
                        break;
                      case 'checkbox':
                        newVal = newVal.map((item: string) =>
                          getOptionFromChoices(item, field.choices)
                        );
                    }
                    Object.assign(change[state], {
                      [`${newKey}.${col}`]: newVal,
                    });
                  });
                  delete change[state][key];
                });
              }
            });
            break;
          case 'matrixdynamic':
            ['new', 'old'].forEach((state) => {
              if (change[state] !== undefined) {
                const formatedState = [];
                for (const entry of change[state]) {
                  const newEntry = {};
                  for (const key in entry) {
                    const newKey = getTitleFromName(key, field.columns);
                    const newVal = getOptionFromChoices(
                      entry[key],
                      field.choices
                    );
                    Object.assign(newEntry, { [newKey]: newVal });
                  }
                  formatedState.push(newEntry);
                }

                const res: string[] = [];
                formatedState.forEach((entry, i) => {
                  let line = `[${i + 1}]`;
                  for (const key in entry) {
                    line = line.concat(`\t${key}: ${entry[key]}`).trim();
                  }
                  res.push(line);
                });
                change[state] = res.join('\n');
              }
            });
            break;
          case 'resource':
            if (change.old !== undefined) change.old = [change.old];
            if (change.new !== undefined) change.new = [change.new];
          // no break for the resources
          case 'resources':
            if (change.old !== undefined)
              change.old = await getResourcesIncrementalID(change.old);
            if (change.new !== undefined)
              change.new = await getResourcesIncrementalID(change.new);
            break;
          case 'users':
            if (change.old !== undefined)
              change.old = await getUsersFromID(change.old);
            if (change.new !== undefined)
              change.new = await getUsersFromID(change.new);
            break;
          case 'owner':
            if (change.old !== undefined)
              change.old = await getOwner(change.old);
            if (change.new !== undefined)
              change.new = await getOwner(change.new);
            break;
          default:
            // for all other cases, keep the values
            break;
        }
      }
    }
    return history;
  }
}

export default RecordHistory;
