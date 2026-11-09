require('fs').appendFileSync(process.env.MARK_DIR ? process.env.MARK_DIR+'/m' : '<probe-dir>/spike/../marks.txt', process.argv[2]+'\n')
