'use strict';
var path = require('path');
var Base = require('yeoman-generator').Base;
var yosay = require('yosay');
var chalk = require('chalk');
var isWin = process.platform === 'win32';
var homedir = (isWin) ? process.env.HOMEPATH : process.env.HOME;
var fs = require('fs');
var mkdirp = require('mkdirp');

function getDirectories(srcpath) {
  return fs.readdirSync(srcpath).filter(function(file) {
    return fs.statSync(path.join(srcpath, file)).isDirectory();
  });
}

module.exports = Base.extend({
  initializing: function () {
    // check for existence of package.json
    try {
      fs.accessSync('./package.json', fs.F_OK);
      this.hasPackageJson = true;
    } catch (e) {
      this.hasPackageJson = false;
    }
  },

  prompting: function () {
    var done = this.async();
    var self = this;

    // Have Yeoman greet the user.
    this.log(yosay('Welcome to the ArcGIS Web AppBuilder generator!'));
    this.log(chalk.yellow('These generators should be run in the root folder of your project.'));

    var prompts = [{
      name: 'abort',
      type: 'confirm',
      default: true,
      message: 'No package.json found. Would you like to abort and run npm init first?',
      when: function() {
        return !self.hasPackageJson;
      }
    }, {
      type: 'list',
      choices: [
        {
          value: 'is2d',
          name: '2D'
        },
        {
          value: 'is3d',
          name: '3D'
        }
      ],
      name: 'widgetsType',
      message: 'Type of widget(s) to be generated:',
      when: function(currentAnswers) {
        return !currentAnswers.abort;
      }
    }, {  
      when: function(currentAnswers) {
        return !currentAnswers.abort;
      },
      name: 'wabRoot',
      message: 'Web AppBuilder install root:',
      'default': function(currentAnswers) {
        var wabDir;
        if (currentAnswers.widgetsType === 'is3d') {
          wabDir = path.join(homedir,  'WebAppBuilderForArcGIS' );
        } else {
          wabDir = path.join(homedir,  'arcgis-web-appbuilder-1.3' );
        }
        return wabDir;
      },    
      validate: function(wabPath) {
        // make sure input directory and apps directory is valid and exists.
        var paths = [wabPath, path.join(wabPath, 'server/apps' )];
        try {
          paths.forEach(function(path) {
            fs.accessSync(path, fs.F_OK);
          });
          return true;
        } catch (e) {
          // It isn't accessible
          return 'Invalid path. Please ensure this is a valid path to your WAB root.';
        }
      }
    }, {
      when: function(currentAnswers) {
        if (currentAnswers.abort) {
          return false;
        }
        var appsPath = path.join(currentAnswers.wabRoot, 'server', 'apps' );
        var appsDirectories = getDirectories(appsPath);
        if (appsDirectories.length > 0) {
          return true;
        } else {
          this.log(chalk.red('You do not have any WAB apps setup yet. After you create an app, please see the Gruntfile for a todo, or run this generator again.'));
        }
      }.bind(this),
      name: 'appDirId',
      type: 'list',
      message: 'Web AppBuilder application:',
      choices: function(currentAnswers) {
        // Always include option for "None"
        var retArray = [{
          name: 'None',
          value: 'None',
          short: 'N'
        }];
        var appsPath = path.join(currentAnswers.wabRoot, 'server', 'apps' );
        var appsDirectories = getDirectories(appsPath);
        appsDirectories.forEach(function(appDirectory) {
          try {
            // get the config file, convert to JSON, and read the title property
            var configPath = path.join(currentAnswers.wabRoot, 'server', 'apps', appDirectory, 'config.json');
            var configJson = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if(configJson.hasOwnProperty('title') && configJson.title !== '') {
              retArray.push({
                name: configJson.title,
                value: appDirectory,
                short: appDirectory
              });
            } else {
              // does not have title property or is empty. Use the app folder name (number) as the name.
              retArray.push({
                name: appDirectory,
                value: appDirectory,
                short: appDirectory
              });
            }
          } catch (e) {
            // Cannot open the config file. Just use the app folder name (number) as the name
            retArray.push({
              name: appDirectory,
              value: appDirectory,
              short: appDirectory
            });
          }
        });
        return retArray;
      }
    }];

    this.prompt(prompts, function (props) {
      this.abort = props.abort;
      this.wabRoot = props.wabRoot;
      this.widgetsType = props.widgetsType;
      if (props.appDirId && props.appDirId !== 'None') {
        this.appDirId = props.appDirId;
      } else {
        this.appDirId = false;
      }
      done();
    }.bind(this));
  },

  writing: {
    app: function () {
      if (this.abort) {
        return;
      }
      mkdirp('widgets');
      this.config.set('widgetsType', this.widgetsType);
    },

    gruntConfig: function() {
      if (this.abort) {
        return;
      }
      var stemappDir;
      if (this.widgetsType === 'is3d') {
        stemappDir = path.join(this.wabRoot, 'client', 'stemapp3d'); 
      } else {
        stemappDir = path.join(this.wabRoot, 'client', 'stemapp');
      }
      var appDir = false;
      if (this.appDirId) {
        appDir = path.join(this.wabRoot, 'server', 'apps', this.appDirId);
      }
      if (isWin) {
        // this hack is needed to ensure paths are not escaped when injected into Gruntfile
        stemappDir = stemappDir.replace(/\\/g, '/');
        if (appDir) {
          appDir = appDir.replace(/\\/g, '/');
        }
      }
      var watchConfig = {
        main: {
          files: ['widgets/**'],
          tasks: ['sync'],
          options: {
            spawn: false
          }
        }
      };
      var filesPrefix = '{src: [\'widgets/**\'], dest: ';
      var syncConfig = '{ main: { verbose: true, files: [';
      syncConfig = syncConfig + filesPrefix + 'stemappDir }';
      if (appDir) {
        syncConfig = syncConfig + ',' + filesPrefix + 'appDir }';
      }
      syncConfig = syncConfig + ']';
      syncConfig = syncConfig + '} }';
      this.gruntfile.insertVariable('stemappDir', '"' + stemappDir + '"');
      if (appDir) {
        this.gruntfile.insertVariable('appDir', '"' + appDir + '"');
      } else {
        this.gruntfile.insertVariable('appDir', '"TODO - AFTER CREATING AN APP, PLEASE PUT PATH HERE AND INSERT ENTRY IN SYNC.MAIN.FILES BELOW."');
      }
      this.gruntfile.insertConfig('watch', JSON.stringify(watchConfig));
      this.gruntfile.insertConfig('sync', syncConfig);
      this.gruntfile.loadNpmTasks('grunt-contrib-watch');
      this.gruntfile.loadNpmTasks('grunt-sync');
      this.gruntfile.registerTask('default', ['sync', 'watch']);
    },

    projectfiles: function () {
      if (this.abort) {
        return;
      }
      this.copy('editorconfig', '.editorconfig');
      this.copy('jshintrc', '.jshintrc');
    }
  },

  install: function() {
    if (this.abort || this.options['skip-install']) {
      return;
    }
    this.npmInstall(['grunt', 'grunt-contrib-watch', 'grunt-sync'], { 'saveDev': true });
  }
});
