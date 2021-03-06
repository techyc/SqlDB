/*******************************************************************************

   Copyright (C) 2012-2014 SqlDB Ltd.

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.

*******************************************************************************/
/*
@description: scan host
@modify list:
   2014-7-26 Zhaobo Tan  Init
@parameter
   BUS_JSON: the format is: { "HostInfo": [ { "HostName": "susetzb", "User": "root", "Passwd": "sqldb", "SshPort": "22", "AgentPort": "11790" }, { "IP": "192.168.20.165", "User": "root", "Passwd": "sqldb", "SshPort": "22", "AgentPort": "11790" } ] } ;
@return
   RET_JSON: the format is: { "HostInfo": [ { "errno": 0, "detail": "", "Status": "finish", "IP": "192.168.20.42", "HostName": "susetzb" }, { "errno": 0, "detail": "", "Status": "finish", "IP": "192.168.20.165", "HostName": "rhel64-test8" } ] }                            
*/

var FILE_NAME_SCAN_HOST = "scanHost.js" ;
var RET_JSON            = new Object() ;
RET_JSON[HostInfo]      = [] ;
var errMsg              = "" ;
/* *****************************************************************************
@discretion: scan the specified host, to check whether it can been "ping" and "ssh",
             and try to get it's hostname or ip
@author: Tanzhaobo
@parameter
   user[string]: the user name
   passwd[string]: the password
   hostname[string]: the hostname
   sshport[int]: the ssh port
   ip[string]: the ip address
@note
   either ip or hostname must be specified
@return
   retObj[object]: the scan host result
***************************************************************************** */
function _scanHost( user, passwd, hostname, sshport, ip )
{
   var ssh             = null ;
   var ping            = null ;
   var addr            = null ;
   var tempRet         = null ;
   var retObj          = new scanHostResult() ;

   if ( null != ip && undefined != ip )
   {
      addr = ip ;
      retObj[IP] = ip ;
   }
   else if ( null != hostname && undefined != hostname )
   {
      addr = hostname ;
      retObj[HostName] = hostname ;
   }
   else
   {
      retObj[Errno] = SDB_INVALIDARG ;
      retObj[Detail] = "No usable hostname and ip" ;
      retObj[Status] = "ping" ;
      return retObj ;
   }
   // ping 
   try
   {
      tempRet = System.ping( addr ) ;
      var ping = eval( "(" + tempRet + ")" ) ;
      if( true != ping[Reachable] )
         exception_handle( SDB_INVALIDARG, "Host unreachable" ) ;
   }
   catch( e )
   {
      SYSEXPHANDLE( e ) ;
      retObj[Status] = "ping" ;
      retObj[Errno] = GETLASTERROR() ;
      retObj[Detail] = GETLASTERRMSG() ;
      PD_LOG( arguments, PDERROR, FILE_NAME_SCAN_HOST,
              "Failed to ping host[" + addr + "], rc: " + retObj[Errno] + ", detail: " + retObj[Detail] ) ;
      return retObj ;
   }
   // ssh
   try
   {
      ssh = new Ssh( addr, user, passwd, sshport ) ;
   }
   catch ( e )
   {
      SYSEXPHANDLE( e ) ;
      retObj[Status] = "ssh" ;
      retObj[Errno] = GETLASTERROR() ;
      retObj[Detail] = GETLASTERRMSG() ;
      PD_LOG( arguments, PDERROR, FILE_NAME_SCAN_HOST,
              "Failed to ssh to host[" + addr + "], rc: " + retObj[Errno] + ", detail: " + retObj[Detail] ) ;
      return retObj ;
   }
   // getinfo( get ip or hostname )
   try
   {
      var tempStr = "" ;
      if ( "" == retObj[HostName] )
      {
         tempStr = ssh.exec("hostname") ;
         if ( "string" != typeof(tempStr) )
            exception_handle( SDB_SYS, "Failed to get peer hostname" ) ;
         retObj[HostName] = removeLineBreak( tempStr ) ;
      }
      else
      {
         tempStr = ssh.getPeerIP() ;
         if ( "string" != typeof(tempStr) )
            exception_handle( SDB_SYS, "Failed to get peer ip" ) ;
         retObj[IP] = removeLineBreak( tempStr ) ;
      }
   }
   catch( e )
   {
      SYSEXPHANDLE( e ) ;
      retObj[Status] = "getinfo" ;
      retObj[Errno] = GETLASTERROR() ;
      retObj[Detail] = GETLASTERRMSG() ;
      PD_LOG( arguments, PDERROR, FILE_NAME_SCAN_HOST,
              "Failed to host[" + addr + "]'s name, rc: " + retObj[Errno] + ", detail: " + retObj[Detail] ) ;
      return retObj ;
   }
   retObj[Status] = "finish" ;
   
   return retObj ;
}

function main()
{
   PD_LOG( arguments, PDEVENT, FILE_NAME_SCAN_HOST, "Begin to scan host" ) ;
   var infoArr = null ;
   var arrLen = null ;
   try
   {
      infoArr = BUS_JSON[HostInfo] ;
      arrLen = infoArr.length ;
   }
   catch( e )
   {
      SYSEXPHANDLE( e ) ;
      errMsg = "Js receive invalid argument" ;
      rc = GETLASTERROR() ;
      // record error message in log
      PD_LOG( arguments, PDERROR, FILE_NAME_SCAN_HOST,
              errMsg + ", rc: " + rc + ", detail: " + GETLASTERRMSG() ) ;
      // tell to user error happen
      exception_handle( SDB_INVALIDARG, errMsg ) ;
   }
   if ( arrLen == 0 )
   {
      PD_LOG( arguments, PDSEVERE, FILE_NAME_SCAN_HOST, "Not specified any host to scan" ) ;
      exception_handle( SDB_INVALIDARG, "Not specified any host to scan" ) ;
   }
   for( var i = 0; i < arrLen; i++ )
   {
      var obj      = null ;
      var user     = null ;
      var passwd   = null ;
      var hostname = null ;
      var sshport  = null ;
      var ip       = null ;
      var ret      = new scanHostResult() ;
      try
      {
         obj       = infoArr[i] ;
         user      = obj[User] ;
         passwd    = obj[Passwd] ;
         hostname  = obj[HostName] ;
         sshport   = parseInt(obj[SshPort]) ;
         ip        = obj[IP] ;
         if ( undefined != hostname )
         { 
            if ( "localhost" == hostname )
               hostname = getLocalHostName() ;
            ret = _scanHost( user, passwd, hostname, sshport, null ) ;
         }
         else if ( undefined != ip )
         {
            if ( "127.0.0.1" == ip )
               ip = getLocalIP() ;
            ret = _scanHost( user, passwd, null, sshport, ip ) ;
         }
         else
         {
            errMsg = "Not specified host name or ip" ;
            ret[Errno] = SDB_INVALIDARG ;
            ret[Detail] = errMsg ;
            PD_LOG( arguments, PDERROR, FILE_NAME_SCAN_HOST, errMsg ) ;
         }
      }
      catch ( e )
      {
         SYSEXPHANDLE( e ) ;
         if ( undefined != hostname && null != hostname )
            ret[HostName] = hostname ;
         if ( undefined != ip && null != ip )
            ret[IP] = ip ;
         ret[Errno] = GETLASTERROR() ;
         ret[Detail] = GETLASTERRMSG() ;
         PD_LOG( arguments, PDERROR, FILE_NAME_SCAN_HOST,
                 "Failed to scan host[" + hostname + "/" + ip + "]: rc = " + ret[Errno] + ", detail = " + ret[Detail] ) ;
      }
      RET_JSON[HostInfo].push( ret ) ;
   }
   
   PD_LOG( arguments, PDEVENT, FILE_NAME_SCAN_HOST, "Finish scanning host" ) ;
   return RET_JSON ;
}

// execute
main() ;

