(function() {
    'use strict';
    angular.module('gantt').factory('Gantt', [
        'GanttApi', 'GanttOptions', 'GanttCalendar', 'GanttScroll', 'GanttBody', 'GanttRowHeader', 'GanttHeader', 'GanttSide', 'GanttObjectModel', 'GanttRowsManager', 'GanttColumnsManager', 'GanttTimespansManager', 'GanttCurrentDateManager', 'ganttArrays', 'moment', '$document', '$timeout',
        function(GanttApi, Options, Calendar, Scroll, Body, RowHeader, Header, Side, ObjectModel, RowsManager, ColumnsManager, TimespansManager, CurrentDateManager, arrays, moment, $document, $timeout) {
            // Gantt logic. Manages the columns, rows and sorting functionality.
            var Gantt = function($scope, $element) {
                var self = this;

                this.$scope = $scope;
                this.$element = $element;

                this.options = new Options($scope, {
                    'api': angular.noop,
                    'data': [],
                    'timespans': [],
                    'viewScale': 'day',
                    'columnMagnet': '15 minutes',
                    'showSide': true,
                    'allowSideResizing': true,
                    'currentDate': 'line',
                    'currentDateValue': moment,
                    'autoExpand': 'none',
                    'taskOutOfRange': 'truncate',
                    'maxHeight': 0,
                    'timeFrames': [],
                    'dateFrames': [],
                    'timeFramesWorkingMode': 'hidden',
                    'timeFramesNonWorkingMode': 'visible'
                });

                this.api = new GanttApi(this);

                this.api.registerEvent('core', 'ready');
                this.api.registerEvent('core', 'rendered');

                this.api.registerEvent('directives', 'preLink');
                this.api.registerEvent('directives', 'postLink');
                this.api.registerEvent('directives', 'new');
                this.api.registerEvent('directives', 'destroy');

                this.api.registerEvent('data', 'change');
                this.api.registerEvent('data', 'load');
                this.api.registerEvent('data', 'remove');
                this.api.registerEvent('data', 'clear');

                this.api.registerMethod('core', 'getDateByPosition', this.getDateByPosition, this);
                this.api.registerMethod('core', 'getPositionByDate', this.getPositionByDate, this);

                this.api.registerMethod('data', 'load', this.loadData, this);
                this.api.registerMethod('data', 'remove', this.removeData, this);
                this.api.registerMethod('data', 'clear', this.clearData, this);
                this.api.registerMethod('data', 'get', this.getData, this);

                this.calendar = new Calendar(this);
                this.calendar.registerTimeFrames(this.options.value('timeFrames'));
                this.calendar.registerDateFrames(this.options.value('dateFrames'));

                this.api.registerMethod('timeframes', 'registerTimeFrames', this.calendar.registerTimeFrames, this.calendar);
                this.api.registerMethod('timeframes', 'clearTimeframes', this.calendar.clearTimeFrames, this.calendar);
                this.api.registerMethod('timeframes', 'registerDateFrames', this.calendar.registerDateFrames, this.calendar);
                this.api.registerMethod('timeframes', 'clearDateFrames', this.calendar.clearDateFrames, this.calendar);
                this.api.registerMethod('timeframes', 'registerTimeFrameMappings', this.calendar.registerTimeFrameMappings, this.calendar);
                this.api.registerMethod('timeframes', 'clearTimeFrameMappings', this.calendar.clearTimeFrameMappings, this.calendar);

                $scope.$watchGroup(['timeFrames', 'dateFrames'], function(newValues, oldValues) {
                    if (newValues !== oldValues) {
                        var timeFrames = newValues[0];
                        var dateFrames = newValues[1];

                        var oldTimeFrames = oldValues[0];
                        var oldDateFrames = oldValues[1];

                        if (!angular.equals(timeFrames, oldTimeFrames)) {
                            self.calendar.clearTimeFrames();
                            self.calendar.registerTimeFrames(timeFrames);
                        }

                        if (!angular.equals(dateFrames, oldDateFrames)) {
                            self.calendar.clearDateFrames();
                            self.calendar.registerDateFrames(dateFrames);
                        }

                        self.columnsManager.generateColumns();
                    }
                });

                var extractColumnMagnet = function(newValue, oldValue) {
                    if (newValue !== oldValue) {

                        var splittedColumnMagnet;
                        var columnMagnet = self.options.value('columnMagnet');
                        if (columnMagnet) {
                            splittedColumnMagnet = columnMagnet.trim().split(' ');
                        }
                        if (splittedColumnMagnet && splittedColumnMagnet.length > 1) {
                            self.columnMagnetValue = parseFloat(splittedColumnMagnet[0]);
                            self.columnMagnetUnit = splittedColumnMagnet[splittedColumnMagnet.length - 1];
                        } else {
                            self.columnMagnetValue = undefined;
                            self.columnMagnetUnit = undefined;
                        }
                    }
                };
                $scope.$watch('columnMagnet', extractColumnMagnet);
                extractColumnMagnet(self.options.value('columnMagnet'));

                $scope.$watchGroup(['shiftColumnMagnet', 'viewScale'], function(newValues, oldValues) {
                    if (newValues !== oldValues) {
                        var splittedColumnMagnet;
                        var shiftColumnMagnet = self.options.value('shiftColumnMagnet');
                        if (shiftColumnMagnet) {
                            splittedColumnMagnet = shiftColumnMagnet.trim().split(' ');
                        }
                        if (splittedColumnMagnet !== undefined && splittedColumnMagnet.length > 1) {
                            self.shiftColumnMagnetValue = parseFloat(splittedColumnMagnet[0]);
                            self.shiftColumnMagnetUnit = splittedColumnMagnet[splittedColumnMagnet.length - 1];
                        } else {
                            self.shiftColumnMagnetValue = undefined;
                            self.shiftColumnMagnetUnit = undefined;
                        }
                    }
                });

                $document.on('keyup keydown', function(e) {
                    self.shiftKey = e.shiftKey;
                    return true;
                });

                this.scroll = new Scroll(this);
                this.body = new Body(this);
                this.header = new Header(this);
                this.side = new Side(this);

                this.objectModel = new ObjectModel(this.api);

                this.rowsManager = new RowsManager(this);
                this.columnsManager = new ColumnsManager(this);
                this.timespansManager = new TimespansManager(this);
                this.currentDateManager = new CurrentDateManager(this);

                this.originalWidth = 0;
                this.width = 0;

                if (angular.isFunction(this.$scope.api)) {
                    this.$scope.api(this.api);
                }

                var hasRowModelOrderChanged = function(data1, data2) {
                    if (data2 === undefined || data1.length !== data2.length) {
                        return true;
                    }

                    for (var i = 0, l = data1.length; i < l; i++) {
                        if (data1[i].id !== data2[i].id) {
                            return true;
                        }
                    }

                    return false;
                };

                $scope.$watchCollection('data', function(newData, oldData) {
                    if (oldData !== undefined) {
                        var toRemoveIds = arrays.getRemovedIds(newData, oldData);
                        if (toRemoveIds.length === oldData.length) {
                            self.rowsManager.removeAll();

                            // DEPRECATED
                            self.api.data.raise.clear(self.$scope);
                        } else {
                            for (var i = 0, l = toRemoveIds.length; i < l; i++) {
                                var toRemoveId = toRemoveIds[i];
                                self.rowsManager.removeRow(toRemoveId);
                            }

                            // DEPRECATED
                            var removedRows = [];
                            angular.forEach(oldData, function(removedRow) {
                                if (toRemoveIds.indexOf(removedRow.id) > -1) {
                                    removedRows.push(removedRow);
                                }
                            });
                            self.api.data.raise.remove(self.$scope, removedRows);
                        }
                    }

                    if (newData !== undefined) {
                        var modelOrderChanged = hasRowModelOrderChanged(newData, oldData);

                        if (modelOrderChanged) {
                            self.rowsManager.resetNonModelLists();
                        }

                        for (var j = 0, k = newData.length; j < k; j++) {
                            var rowData = newData[j];
                            self.rowsManager.addRow(rowData, modelOrderChanged);
                        }

                        self.api.data.raise.change(self.$scope, newData, oldData);

                        // DEPRECATED
                        self.api.data.raise.load(self.$scope, newData);
                    }
                });
            };

            // Returns the exact column date at the given position x (in em)
            Gantt.prototype.getDateByPosition = function(x, magnet, disableExpand) {
                var column = this.columnsManager.getColumnByPosition(x, disableExpand);
                if (column !== undefined) {
                    var magnetValue;
                    var magnetUnit;
                    if (magnet) {
                        if (this.shiftKey) {
                            if (this.shiftColumnMagnetValue !== undefined && this.shiftColumnMagnetUnit !== undefined) {
                                magnetValue = this.shiftColumnMagnetValue;
                                magnetUnit = this.shiftColumnMagnetUnit;
                            } else {
                                magnetValue = 0.25;
                                magnetUnit = this.options.value('viewScale');
                            }
                        } else {
                            magnetValue = this.columnMagnetValue;
                            magnetUnit = this.columnMagnetUnit;
                        }
                    }

                    return column.getDateByPosition(x - column.left, magnetValue, magnetUnit);
                } else {
                    return undefined;
                }
            };

            // Returns the position inside the Gantt calculated by the given date
            Gantt.prototype.getPositionByDate = function(date, disableExpand) {
                if (date === undefined) {
                    return undefined;
                }

                if (!moment.isMoment(moment)) {
                    date = moment(date);
                }

                var column = this.columnsManager.getColumnByDate(date, disableExpand);
                if (column !== undefined) {
                    return column.getPositionByDate(date);
                } else {
                    return undefined;
                }
            };

            // DEPRECATED - Use getData instead.
            Gantt.prototype.loadData = function(data) {
                if (!angular.isArray(data)) {
                    data = data !== undefined ? [data] : [];
                }

                if (this.$scope.data === undefined) {
                    this.$scope.data = data;
                } else {
                    for (var i = 0, l = data.length; i < l; i++) {
                        var row = data[i];

                        var j = arrays.indexOfId(this.$scope.data, row.id);
                        if (j > -1) {
                            this.$scope.data[j] = row;
                        } else {
                            this.$scope.data.push(row);
                        }
                    }
                }
            };

            Gantt.prototype.getData = function() {
                return this.$scope.data;
            };

            // DEPRECATED - Use getData instead.
            Gantt.prototype.removeData = function(data) {
                if (!angular.isArray(data)) {
                    data = data !== undefined ? [data] : [];
                }

                if (this.$scope.data !== undefined) {
                    for (var i = 0, l = data.length; i < l; i++) {
                        var rowToRemove = data[i];

                        var j = arrays.indexOfId(this.$scope.data, rowToRemove.id);
                        if (j > -1) {
                            if (rowToRemove.tasks === undefined || rowToRemove.tasks.length === 0) {
                                // Remove complete row
                                this.$scope.data.splice(j, 1);
                            } else {
                                // Remove single tasks
                                var row = this.$scope.data[j];
                                for (var ti = 0, tl = rowToRemove.tasks.length; ti < tl; ti++) {
                                    var taskToRemove = rowToRemove.tasks[ti];

                                    var tj = arrays.indexOfId(row.tasks, taskToRemove.id);
                                    if (tj > -1) {
                                        row.tasks.splice(tj, 1);
                                    }
                                }
                            }
                        }
                    }
                }
            };

            // DEPRECATED - Use getData instead.
            Gantt.prototype.clearData = function() {
                this.$scope.data = undefined;
            };

            Gantt.prototype.getWidth = function() {
                return this.$scope.ganttElementWidth;
            };

            Gantt.prototype.initialized = function() {
                // Gantt is initialized. Signal that the Gantt is ready.
                this.api.core.raise.ready(this.api);

                this.rendered = true;
                this.columnsManager.generateColumns();

                var gantt = this;
                var renderedFunction = function() {
                    gantt.options.set('sideWidth', gantt.side.getWidth());
                    gantt.api.core.raise.rendered(gantt.api);
                };
                $timeout(renderedFunction);
            };

            return Gantt;
        }]);
}());
