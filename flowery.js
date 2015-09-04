#!/usr/bin/env node

if ( process.env.NODE_ENV && process.env.NODE_ENV !== 'production' ) {
	process.stdout.write( '\u001B[2J\u001B[0;0f' );
}

process.stdout.write( '\u001B[2J\u001B[0;0f' );

/*

Usage

1. CLI - file

	$ babel-node flowery log.txt

2. CLI - pipe

	$ flow | babel-node flowery

3. API

	import readFile from './flowery';
	readFile('z.txt').then( result => {console.log(result)}) // {arrErrorObj: [...], arrMessages: [...] }

*/

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

const SIMPLE = 1;
const NORMAL = 2;
const TYPE_ERROR = 3;
const INVERTED = 4;

let arrMessages, results;

if ( process.argv.length > 2 ) {
	// 有傳入檔案名稱的話，代表已有 flow 生成的 json log txt，可直接開檔
	readFile( process.argv[2] )
	.then( data => {
		debugger;

		go(data);
		/*let arrErrors = generateErrorObjects( data )

		if ( arrErrors ) {
			arrMessages = generateErrorMessages( arrErrors );
			results = arrMessages.join( '' );
			writeFile( results );
			console.log( results );
			return results;
		}else {
			console.log( 'No Error!' );
			return 'No Error!';
		}*/

	} );

} else {

	readStdin()

	.then( data => {

		debugger;
		go(data);
	} )

	.catch(err => {
		debugger;
		console.log( '要跑 wrapper 囉: ', err );
		runner();
	})
}

function go(data){

	// console.log( 'stdin data: ', data );
	let arrErrors = generateErrorObjects( data )

	if ( arrErrors ) {
		arrMessages = generateErrorMessages( arrErrors );
		results = arrMessages.join( '' );
		writeFile( results );
		console.log( results );
		return results;
	}else {
		console.log( 'No Error!' );
		return 'No Error!';
	}
}

function runner(){

	var exec = require('exec');
	// var exec = require('child_process').execFile;

	exec(['flow', '--json'], (err, out, code) => {
	// exec('flow', ['--json'], (err, out, code) => {
	  // if (err instanceof Error)
	  //   throw err;
	  // process.exit(code);

	  console.log( '結果: ', arguments );
	  if(err){
	  	return console.log('ruuner err: ', err);
	  }

	  let data = parseJson(out);

	  if(!data) return process.exit(1);

	  // console.log( 'runner data: ', data );

	  go(data);
	});

	// console.log( 'runner 結果: ', child );
}

// 如果是透過 cli pipe 進來的，就從 stdin 讀資料
// $ flow | babel-node code.js
function readStdin() {

	return new Promise( ( resolve, reject ) => {
		let content;

		process.stdin.setEncoding( 'utf8' );
		process.stdin.on( 'readable', function() {

			content = process.stdin.read();

			if ( content !== null ) {

				// 有讀到東西，但有可能是 JSON
				content = parseJson(content)

				if(!content) return process.exit(1);

				resolve( content );

			} else {
				reject( 'no data' );
				process.stdin.end(); // pause()
			}
		} );
	} )
}

// 將 json string 轉回 js obj
function parseJson( data ) {

	let content;

	try {
		content = JSON.parse( data );
	}catch ( e ) {
		console.error('Invalid JSON format, did you forget to add "--json" argument to flow?');
		return null;
	}

	return content;
}

// 讀取檔案，並解析 JSON 後返還結果
// 也可透過 API 傳入檔案(效果等於 pipe)
export default function readFile( name ) {

	let data, content;

	return new Promise( ( resolve, reject ) => {

		data = fs.readFileSync( name, {encoding:'utf8'} );

		content = parseJson( data );

		resolve( content );
	} )
}

// 逐條將每個錯誤整理成 {invoke:..., receive:..., type:...} 正規化格式，方便日後使用
function generateErrorObjects( {errors, passed, version} ) {

	if ( passed ) return null;

	let invoke, receive, lines, errLineContent, errSelection;

	let arrErrors = errors.map( item => {

		let arrMessage = item.message;

		switch ( arrMessage.length ) {

			case 1:
				invoke = arrMessage[0];

				 lines = getTargetFile( invoke.path );
				 errLineContent = lines[invoke.line - 1];
				 errSelection = errLineContent.substring( invoke.start - 1, invoke.end );

				 let msg = invoke.descr.split( '\n' );

				 let o = {
					errTarget: msg[0],
					errMsg: msg[1],
					errPath: invoke.path,
					errLine: invoke.line,
					errLineContent,
					errSelection,
					errStart: invoke.start,
					errEnd: invoke.end,
				 }
				 return {invoke: o, receive: null, type: SIMPLE };

			case 2:
				invoke = arrMessage[0];
				receive = arrMessage[1]; // 用不到

				lines = getTargetFile( invoke.path );
				errLineContent = lines[invoke.line - 1];
				errSelection = errLineContent.substring( invoke.start - 1, invoke.end );

				// errMsg: "Property not found in" ← in 拿掉，將 length 組合進去
				// errTarget: "property length" ← 取出 length 值
				var msg = invoke.descr.split( '\n' );
				let prop = msg[0].replace( 'property ', '' );
				let _msg = msg[1].replace( 'Property', 'Property ' + prop ).replace( ' in', '' )

				var o = {
					errTarget: msg[0],
					errMsg: _msg,
					errPath: invoke.path,
					errLine: invoke.line,
					errLineContent,
					errSelection,
					errStart: invoke.start,
					errEnd: invoke.end,
				}

				return {invoke: o, receive: null, type: NORMAL };

			case 3:

				if ( arrMessage[1].descr.indexOf( 'type is incompatible' ) != -1 ) {

					// +TYPE ERROR+
					invoke = arrMessage[1];
					receive = arrMessage[2];

					lines = getTargetFile( invoke.path );
					errLineContent = lines[invoke.line - 1];
					errSelection = errLineContent.substring( invoke.start - 1, invoke.end );

					msg = invoke.descr.split( '\n' );
					var o1 = {
						errTarget: msg[0],
						errMsg: msg[1],
						errPath: invoke.path,
						errLine: invoke.line,
						errLineContent,
						errSelection,
						errStart: invoke.start,
						errEnd: invoke.end,
					}

					var o2 = {
						errTarget: receive.descr,
						errMsg: null,
						errPath: receive.path,
						errLine: receive.line,
						errLineContent: getTargetFile( receive.path )[receive.line - 1],
						errSelection: null,
						errStart: receive.start,
						errEnd: receive.end,
					}

					return { invoke: o1, receive: o2, type: TYPE_ERROR };

				}else {

					// +INVERTED+
					invoke = arrMessage[2];
					receive = arrMessage[1];

					lines = getTargetFile( invoke.path );
					errLineContent = lines[invoke.line - 1];
					errSelection = errLineContent.substring( invoke.start - 1, invoke.end );

					msg = receive.descr.split( '\n' );
					var o1 = {
						errTarget: null,
						errMsg: msg[1].replace( 'Property cannot be accessed on ', '' ),	// 人工改過
						errPath: invoke.path,
						errLine: invoke.line,
						errLineContent: getTargetFile( invoke.path )[invoke.line - 1],
						errSelection: null,
						errStart: invoke.start,
						errEnd: invoke.end,
					}

					lines = getTargetFile( receive.path );
					errLineContent = lines[receive.line - 1];
					errSelection = errLineContent.substring( receive.start - 1, receive.end );

					// 將字串加工成易讀的訊息
					msg = receive.descr.split( '\n' );

					// msg[0] errTarget: "property length"
					// msg[1] errMsg: "Property cannot be accessed on possibly null value"
					let prop = msg[0].replace( 'property ', '' ); // 得到 length 字串
					// prop = chalk.red(prop); // jxtest: 上色
					prop = '_' + prop + '_';
					msg[1] = msg[1].split( ' ' );
					msg[1].splice( 1, 0, prop );
					msg[1] = msg[1].join( ' ' );

					var o2 = {
						errTarget: msg[0],
						errMsg: msg[1],
						errPath: receive.path,
						errLine: receive.line,
						errLineContent: getTargetFile( receive.path )[receive.line - 1],
						errSelection: null,
						errStart: receive.start,
						errEnd: receive.end,
					}
				}

				return { invoke: o1, receive: o2, type: INVERTED };

		}
	} )

	// 加上日期與錯誤數量等 meta data
	// let date = 'Created: ' + new Date().toString() + '\n';
	// arrErrors = [{ createdDate: date }, {total: arrErrors.length}, ...arrErrors];

	return arrErrors;
}

// 將整理好的 errors arr 逐條生成易讀的錯誤訊息
function generateErrorMessages( arrErrors ) {

	// 應用：從 errObj 內生成錯誤訊息字串，方便 screen print 或寫出檔案
	let arrMessages = arrErrors.reduce(
			( ac, item ) => {
				return [...ac, formatMessage( item )];
			},

			[]
		);

	// 偷加上日期與錯誤數量等 meta data
	let date = 'Created: ' + new Date().toString() + '\n';
	arrMessages = [date, `Total Errors: ${arrMessages.length}`, ...arrMessages];

	// console.log( '\n\n>>arrMessages: ', JSON.stringify(arrMessages, null, 2) );
	// console.log( '錯誤數量:', errCount );

	return arrMessages;

}

// 這是 arrErrors 的一種應用，就是漂亮的打印出來
// errObj: { invoke: o1, receive: o2, type: INVERTED }
function formatMessage( {invoke, receive, type} ) {

	let template, result, spaces, spaces2;

	// console.log( '\ninvokeObj: ', invoke, '\n\nreceive: ', receive, '\ntype: ', type );
	switch ( type ){

		case SIMPLE:
			spaces = new Array( invoke.errStart ).join( ' ' );

			template = `
				> Error:
				  ${invoke.errPath}, line ${invoke.errLine}
				  ${invoke.errLineContent}
				  ${spaces}↑ ${invoke.errMsg}: ${invoke.errTarget}
			`;

			break;

		case NORMAL:

			spaces = new Array( invoke.errStart ).join( ' ' );
			template = `
				> Error:
				  ${invoke.errPath}, line ${invoke.errLine}
				  ${invoke.errLineContent}
				  ${spaces}↑ ${invoke.errMsg}
			`;

			break;

		case TYPE_ERROR:

			// debugger;

			spaces = new Array( invoke.errStart ).join( ' ' );
			spaces2 = new Array( receive.errStart ).join( ' ' );

			template = `
				> Error:
				  ${invoke.errPath}, line ${invoke.errLine}
				  ${invoke.errLineContent}
				  ${spaces}↑ type should be ${receive.errTarget}, got ${invoke.errTarget}

				  From:
				  ${receive.errPath}, line ${receive.errLine}
				  ${receive.errLineContent}
				  ${spaces2}↑ triggered here
			`;

			break;

		case INVERTED:

			// debugger;
			spaces = new Array( invoke.errStart ).join( ' ' );

			spaces2 = new Array( receive.errStart ).join( ' ' );

			// 特別之處: 這裏拿到的 inovke 與 receive 在早先整理時已被對調過
			template = `
				> Error:
				  ${invoke.errPath}, line ${invoke.errLine}
				  ${invoke.errLineContent}
				  ${spaces}↑ ${invoke.errMsg}

				  From:
				  ${receive.errPath}, line ${receive.errLine}
				  ${receive.errLineContent}
				  ${spaces2}↑ ${receive.errMsg}
			`;
			break;
	}

	result = template.replace( /\t/gi, '' );
	return result;
}

function getTargetFile( file ) {

	// @todo: 將來先檢查　map 中是否已讀過此檔案
	var contents = fs.readFileSync( file, {encoding:'utf8'} )
					 .split( '\n' );

	// contents.forEach( ( item, idx ) => console.log( '>> ', idx, ' = ', item ) )

	return contents;
}

function writeFile( data ) {
	fs.writeFile( 'flow-results.txt', data, function( err ) {
		if ( err ) throw err;
		console.log( '\nflow-results.txt saved.' );
	} );
}
